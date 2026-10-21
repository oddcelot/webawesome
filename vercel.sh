#!/bin/bash

echo "Running the build!"

cd packages/webawesome && pnpm install && pnpm exec vp run build
