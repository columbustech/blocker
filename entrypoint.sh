#!/bin/bash
mkdir -p /storage/public/
mkdir -p /storage/output/
cp -r /ui/build/* /storage/public/
/go/container-manager/container-manager &
pm2 start /api/src/server.js
#node src/server.js &
mkdir -p /storage/data
mongod --dbpath /storage/data &
service nginx start
