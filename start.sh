#!/bin/sh
if [ -z "$DEBUG" ]; then
  # Your commands or code when DEBUG is not set
  echo "Cleaning up debug logs";
  find src -type f -name "*.js" -exec sed -i '/^[[:space:]]*config\.debug &&/d' {} \;
fi
npm start