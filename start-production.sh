#!/bin/sh
set -e

node --enable-source-maps artifacts/api-server/dist/index.mjs
