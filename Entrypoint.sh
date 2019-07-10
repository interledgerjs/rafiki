#!/bin/bash

if [ "${1}" == 'migrate' ]
then
  exec node './build/src/migrate.js'
else
  exec node './build/src/start.js'
fi
