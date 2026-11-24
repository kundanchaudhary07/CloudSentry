output "aws_region" {
  description = "Region used for the sandbox."
  value       = var.aws_region
}

output "instance_id" {
  description = "Disposable EC2 instance identifier."
  value       = aws_instance.sandbox.id
}

output "security_group_id" {
  description = "Sandbox security group identifier."
  value       = aws_security_group.sandbox.id
}

output "unattached_volume_id" {
  description = "Encrypted, unattached test volume identifier."
  value       = aws_ebs_volume.unattached_test.id
}

output "test_bucket_name" {
  description = "Private test bucket name; public access is blocked."
  value       = aws_s3_bucket.test.id
}
