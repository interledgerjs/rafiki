Deploying using HELM

```shell script
  helm install --set config.ilpAddress='test.rafiki' --set config.databaseConnectionString='mysql://root:password@address/database' -n rafiki --namespace rafiki ./rafiki
```
