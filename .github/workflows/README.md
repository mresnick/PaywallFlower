# GitHub Actions Docker Workflow

This workflow automatically builds and publishes Docker images for the PaywallFlower bot.

## Features

- **Multi-platform builds**: Supports both `linux/amd64` and `linux/arm64` architectures
- **Dual registry publishing**: Publishes to both GitHub Container Registry (GHCR) and Docker Hub
- **Security scanning**: Includes Trivy vulnerability scanning
- **Smart tagging**: Automatically tags images based on branch, PR, or semantic version
- **Build caching**: Uses GitHub Actions cache for faster builds

## Triggers

The workflow runs on:
- Push to `main` or `master` branch
- Push of version tags (e.g., `v1.0.0`)
- Pull requests to `main` or `master` branch (build only, no push)

## Required Secrets

To use this workflow, you need to configure the following secrets in your GitHub repository:

### For Docker Hub Publishing (Optional)
1. Go to your repository Settings → Secrets and variables → Actions
2. Add the following secrets:
   - `DOCKERHUB_USERNAME`: Your Docker Hub username
   - `DOCKERHUB_TOKEN`: Your Docker Hub access token

### For GitHub Container Registry
No additional secrets needed - uses the built-in `GITHUB_TOKEN`.

## Setup Instructions

### 1. Docker Hub Setup (Optional)
If you want to publish to Docker Hub:

1. Create a Docker Hub account at https://hub.docker.com
2. Create an access token:
   - Go to Account Settings → Security → Access Tokens
   - Click "New Access Token"
   - Give it a name and select appropriate permissions
   - Copy the generated token

3. Add secrets to your GitHub repository:
   - Go to your repo → Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Add `DOCKERHUB_USERNAME` with your Docker Hub username
   - Add `DOCKERHUB_TOKEN` with your access token

### 2. GitHub Container Registry Setup
GHCR is enabled by default and uses your GitHub credentials automatically.

## Image Tags

The workflow creates the following tags:

- `latest` - Latest build from the default branch
- `main` or `master` - Latest build from the respective branch
- `v1.2.3` - Semantic version tags
- `v1.2` - Major.minor version tags
- `v1` - Major version tags
- `pr-123` - Pull request builds (not pushed to registry)

## Usage

### Pull from GitHub Container Registry
```bash
docker pull ghcr.io/yourusername/paywallflower:latest
```

### Pull from Docker Hub
```bash
docker pull yourusername/paywallflower:latest
```

### Run the container
```bash
docker run -d --name paywallflower \
  -e DISCORD_TOKEN=your_token_here \
  ghcr.io/yourusername/paywallflower:latest
```

## Security

- Images are scanned for vulnerabilities using Trivy
- Scan results are uploaded to GitHub Security tab
- Multi-stage builds minimize attack surface
- Non-root user execution in container

## Troubleshooting

### Build Failures
- Check the Actions tab for detailed logs
- Ensure all required secrets are configured
- Verify Dockerfile syntax and dependencies

### Registry Authentication Issues
- Verify Docker Hub credentials are correct
- Check that GitHub token has package write permissions
- Ensure repository visibility settings allow package publishing

### Multi-platform Build Issues
- Some dependencies may not support all architectures
- Check build logs for platform-specific errors
- Consider using platform-specific base images if needed