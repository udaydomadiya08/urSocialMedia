FROM node:22-alpine

WORKDIR /app

# Copy package manifests and scripts
COPY package.json ecosystem.js ./

# Copy core modules, application source trees, and tests
COPY packages ./packages
COPY apps ./apps
COPY tests ./tests

# Copy documentation
COPY INSAY_*.md README.md ./

# Create persistent storage directories for uploads and databases
RUN mkdir -p /app/apps/insaygram/data /app/apps/insaygram/uploads \
             /app/apps/insaybook/data /app/apps/insaybook/uploads \
             /app/apps/insaysnap/data /app/apps/insaysnap/uploads \
             /app/apps/insaytok/data /app/apps/insaytok/uploads \
             /app/apps/insaycord/data /app/apps/insaycord/uploads \
             /app/apps/insaytube/data /app/apps/insaytube/uploads

# Expose all 6 platform ports
EXPOSE 4173 4174 4175 4176 4177 4178

ENV NODE_ENV=production

CMD ["node", "ecosystem.js"]
