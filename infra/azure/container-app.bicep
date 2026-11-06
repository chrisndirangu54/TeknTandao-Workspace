@description('Unique lowercase deployment identifier')
param appName string
@description('Deployment region')
param location string = resourceGroup().location
@description('Container image explicitly approved by customer')
param image string
@secure()
param registryPassword string = ''
param cpuCores string = '0.5'
param memorySize string = '1Gi'
resource workspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${appName}-logs'
  location: location
  properties: { sku: {name: 'PerGB2018'} retentionInDays: 30 }
}
resource env 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: '${appName}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: workspace.properties.customerId
        sharedKey: workspace.listKeys().primarySharedKey
      }
    }
  }
}
resource app 'Microsoft.App/containerApps@2023-05-01' = {
 name: appName
 location: location
 properties: {
  managedEnvironmentId: env.id
  configuration: {
   ingress: { external: true, targetPort: 8080, transport: 'auto' }
   activeRevisionsMode: 'Single'
  }
  template: {
   containers: [{name: 'app',image: image,resources: {cpu: json(cpuCores),memory: memorySize}}]
   scale: {minReplicas: 0,maxReplicas: 2}
  }
 }
}
output fqdn string = app.properties.configuration.ingress.fqdn
