#!/bin/sh
set -e

echo "Waiting for MinIO to start..."
# Wait for MinIO to be ready
for i in $(seq 1 30); do
  if mc alias set myminio http://minio:9000 minioadmin minioadmin 2>/dev/null; then
    echo "MinIO is ready!"
    break
  fi
  echo "Attempt $i: MinIO not ready yet, waiting..."
  sleep 2
done

echo "Creating buckets..."
mc mb --ignore-existing myminio/files
mc mb --ignore-existing myminio/temp
mc mb --ignore-existing myminio/thumbnails
mc mb --ignore-existing myminio/previews

echo "Setting bucket policies to allow uploads..."
mc anonymous set public myminio/temp
mc anonymous set download myminio/files
mc anonymous set download myminio/thumbnails
mc anonymous set download myminio/previews

echo "MinIO initialization complete!"
echo "Note: CORS is handled by presigned URLs automatically"
