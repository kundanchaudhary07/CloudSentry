variable "aws_region" {
  description = "AWS region containing the disposable sandbox."
  type        = string
  default     = "us-east-1"
}

variable "name_prefix" {
  description = "Prefix used to identify disposable sandbox resources."
  type        = string
  default     = "cloudguard-sandbox"

  validation {
    condition     = can(regex("^[a-z0-9-]{3,30}$", var.name_prefix))
    error_message = "name_prefix must be 3-30 lowercase letters, digits, or hyphens."
  }
}

variable "ssh_allowed_cidr" {
  description = "Optional single IPv4 address in CIDR notation allowed to SSH; null disables SSH ingress."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition = var.ssh_allowed_cidr == null ? true : (
      can(cidrnetmask(var.ssh_allowed_cidr)) &&
      try(tonumber(split("/", var.ssh_allowed_cidr)[1]), 0) == 32
    )
    error_message = "ssh_allowed_cidr must be null or one IPv4 /32 address; public or broad ranges are not allowed."
  }
}
