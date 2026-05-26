# Copy this file to scripts/deploy.local.ps1 (gitignored) and fill in values.
# Values mirror the repo secrets used by .github/workflows/deploy.yml
# (DEPLOY_USER, DEPLOY_HOST, DEPLOY_PATH, DEPLOY_KEY).

$DeployUser = '<ssh-user>'
$DeployHost = '<server-hostname-or-ip>'
$DeployPath = '<absolute/path/on/server>'

# Optional: path to a specific private key. Omit to use the default ssh key resolution.
# $IdentityFile = "$env:USERPROFILE\.ssh\id_ed25519"
