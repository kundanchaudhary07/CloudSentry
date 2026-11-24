terraform {
  required_version = ">= 1.6.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_vpc" "default" {
  default = true
}

data "aws_caller_identity" "current" {}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

data "aws_subnet" "selected" {
  id = data.aws_subnets.default.ids[0]
}

data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "root-device-type"
    values = ["ebs"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

locals {
  required_tags = {
    Project     = "CloudGuard-Sandbox"
    Environment = "sandbox"
    ManagedBy   = "Terraform"
  }
}

resource "aws_security_group" "sandbox" {
  name        = "${var.name_prefix}-sg"
  description = "Restricted CloudGuard disposable sandbox access"
  vpc_id      = data.aws_vpc.default.id
  egress      = []

  dynamic "ingress" {
    for_each = var.ssh_allowed_cidr == null ? [] : [var.ssh_allowed_cidr]
    content {
      description = "Optional SSH access from one explicitly allowed IPv4 address"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = [ingress.value]
    }
  }

  tags = merge(local.required_tags, {
    Name = "${var.name_prefix}-sg"
  })
}

resource "aws_instance" "sandbox" {
  # This instance does not call AWS APIs and intentionally receives no IAM role or AWS credentials.
  #checkov:skip=CKV2_AWS_41:No instance role is the least-privilege choice for this inventory-only sandbox host.
  ami                         = data.aws_ami.amazon_linux.id
  instance_type               = "t3.micro"
  monitoring                  = true
  subnet_id                   = data.aws_subnet.selected.id
  vpc_security_group_ids      = [aws_security_group.sandbox.id]
  associate_public_ip_address = false
  ebs_optimized               = true

  metadata_options {
    http_tokens = "required"
  }

  root_block_device {
    encrypted             = true
    volume_type           = "gp3"
    delete_on_termination = true

    tags = merge(local.required_tags, {
      Name = "${var.name_prefix}-root-volume"
    })
  }

  tags = merge(local.required_tags, {
    Name = "${var.name_prefix}-instance"
  })
}

resource "aws_ebs_volume" "unattached_test" {
  # This encrypted, empty test volume uses AWS-managed EBS encryption.
  #checkov:skip=CKV_AWS_189:An empty disposable volume does not need a customer-managed key; avoiding one keeps destroy cleanup immediate and avoids residual key charges.
  availability_zone = data.aws_subnet.selected.availability_zone
  size              = 1
  type              = "gp3"
  encrypted         = true

  tags = merge(local.required_tags, {
    Name = "${var.name_prefix}-unattached-test"
  })
}

resource "aws_s3_bucket" "test" {
  # This is an empty, short-lived test bucket with no production data.
  #checkov:skip=CKV_AWS_18:Sandbox bucket has no stored production data; access logging is not applicable.
  #checkov:skip=CKV_AWS_144:Cross-region replication would create extra billable sandbox resources.
  bucket_prefix = "${var.name_prefix}-"
  force_destroy = true

  tags = merge(local.required_tags, {
    Name = "${var.name_prefix}-test-bucket"
  })
}

resource "aws_s3_bucket_public_access_block" "test" {
  bucket                  = aws_s3_bucket.test.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "test" {
  bucket = aws_s3_bucket.test.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = "alias/aws/s3"
    }
  }
}

resource "aws_s3_bucket_versioning" "test" {
  bucket = aws_s3_bucket.test.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "test" {
  bucket = aws_s3_bucket.test.id

  rule {
    id     = "expire-sandbox-objects"
    status = "Enabled"

    filter {}

    expiration {
      days = 1
    }

    noncurrent_version_expiration {
      noncurrent_days = 1
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_sns_topic" "s3_events" {
  name              = "${var.name_prefix}-s3-events"
  kms_master_key_id = "alias/aws/sns"

  tags = merge(local.required_tags, {
    Name = "${var.name_prefix}-s3-events"
  })
}

resource "aws_sns_topic_policy" "s3_events" {
  arn = aws_sns_topic.s3_events.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "s3.amazonaws.com"
      }
      Action   = "SNS:Publish"
      Resource = aws_sns_topic.s3_events.arn
      Condition = {
        ArnLike = {
          "aws:SourceArn" = aws_s3_bucket.test.arn
        }
        StringEquals = {
          "aws:SourceAccount" = data.aws_caller_identity.current.account_id
        }
      }
    }]
  })
}

resource "aws_s3_bucket_notification" "test" {
  bucket = aws_s3_bucket.test.id

  topic {
    topic_arn = aws_sns_topic.s3_events.arn
    events    = ["s3:ObjectCreated:*"]
  }

  depends_on = [aws_sns_topic_policy.s3_events]
}
