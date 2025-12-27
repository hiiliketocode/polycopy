FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy entire codebase (workers need access to lib if they import anything)
COPY . .

# Set working directory to project root
WORKDIR /app

# Run the worker (entrypoint will be overridden by fly.toml)
CMD ["node", "workers/worker-hot.js"]

