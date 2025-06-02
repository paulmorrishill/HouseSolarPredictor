#!/bin/bash

# Exit on any error
set -e

# Function to handle errors
handle_error() {
    echo "Error: Build failed at step: $1" >&2
    exit 1
}

echo "Starting build process..."

# Frontend build
echo "Building frontend..."
cd frontend || handle_error "Failed to change to frontend directory"

echo "Installing frontend dependencies..."
if ! npm install; then
    handle_error "Frontend npm install failed"
fi

echo "Building frontend..."
if ! npm run build; then
    handle_error "Frontend build failed"
fi

# Backend build
echo "Building backend..."
cd ../backend || handle_error "Failed to change to backend directory"
mkdir schedules -p
mkdir backend -p
mkdir config -p

echo "Building backend..."
# Fixed the deno run command (assuming this is what you meant)
if ! deno run --check --unstable-sloppy-imports -A --unstable-temporal main.ts; then
    handle_error "Backend build failed"
fi

echo "Build completed successfully!"
exit 0
