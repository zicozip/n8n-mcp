# n8n-MCP Documentation

Welcome to the n8n-MCP documentation. This directory contains comprehensive guides for installation, configuration, and troubleshooting.

## 📚 Documentation Index

### Getting Started
- **[Installation Guide](./INSTALLATION.md)** - All installation methods including Docker, manual, and development setup
- **[Claude Desktop Setup](./README_CLAUDE_SETUP.md)** - Configure Claude Desktop to use n8n-MCP
- **[Quick Start Tutorial](../README.md)** - Basic overview and quick start instructions

### Deployment
- **[HTTP Deployment Guide](./HTTP_DEPLOYMENT.md)** - Deploy n8n-MCP as an HTTP server for remote access
- **[Docker Deployment](../DOCKER_README.md)** - Comprehensive Docker deployment guide
- **[Docker Testing Results](./DOCKER_TESTING_RESULTS.md)** - Docker implementation test results and findings

### Development
- **[Implementation Plan](../IMPLEMENTATION_PLAN.md)** - Technical implementation details
- **[HTTP Implementation Guide](./HTTP_IMPLEMENTATION_GUIDE.md)** - HTTP server implementation details
- **[Development Setup](./INSTALLATION.md#development-setup)** - Set up development environment

### Reference
- **[Troubleshooting Guide](./TROUBLESHOOTING.md)** - Solutions for common issues
- **[API Reference](./API_REFERENCE.md)** - MCP tools and API documentation (if available)
- **[Environment Variables](./INSTALLATION.md#environment-configuration)** - Configuration options

## 🚀 Quick Links

### For Users
1. **First Time Setup**: Start with the [Installation Guide](./INSTALLATION.md)
2. **Claude Desktop Users**: Follow [Claude Desktop Setup](./README_CLAUDE_SETUP.md)
3. **Remote Deployment**: See [HTTP Deployment Guide](./HTTP_DEPLOYMENT.md)

### For Developers
1. **Local Development**: See [Development Setup](./INSTALLATION.md#development-setup)
2. **Docker Development**: Check [Docker README](../DOCKER_README.md)
3. **Contributing**: Read the implementation plans and guides

## 🐳 Docker Quick Start

```bash
# Quick start with Docker
echo "AUTH_TOKEN=$(openssl rand -base64 32)" > .env
docker compose up -d

# Check health
curl http://localhost:3000/health
```

## 📖 Documentation Updates

This documentation is actively maintained. Recent updates include:
- ✅ Docker deployment support (Phase 1 complete)
- ✅ Simplified installation process
- ✅ Enhanced troubleshooting guide
- ✅ Multiple deployment options

## 🤝 Getting Help

- **Issues**: [GitHub Issues](https://github.com/czlonkowski/n8n-mcp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/czlonkowski/n8n-mcp/discussions)
- **Troubleshooting**: [Troubleshooting Guide](./TROUBLESHOOTING.md)

## 📝 License

This project is licensed under the Sustainable Use License. See [LICENSE](../LICENSE) for details.