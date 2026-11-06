#!/usr/bin/env python3
"""Send ONE authenticated physical IoT reading to TeknTandao Workspace.

Required environment: HOTSPOT_IOT_URL, HOTSPOT_ORG_ID, HOTSPOT_SITE_ID,
HOTSPOT_DEVICE_ID, HOTSPOT_DEVICE_SECRET.
Provide a real metrics JSON object via stdin. No synthetic readings are sent.
Example: echo '{"wanUp":true,"batteryPercent":85}' | python3 send_hotspot_telemetry.py
"""
import hashlib, hmac, json, os, sys, time, uuid, urllib.request

def main():
    metrics=json.load(sys.stdin)
    required=['HOTSPOT_IOT_URL','HOTSPOT_ORG_ID','HOTSPOT_SITE_ID',
              'HOTSPOT_DEVICE_ID','HOTSPOT_DEVICE_SECRET']
    cfg={k:os.environ[k] for k in required}
    if not cfg['HOTSPOT_IOT_URL'].startswith('https://'):
        raise ValueError('Signed telemetry must use HTTPS')
    body={'orgId':cfg['HOTSPOT_ORG_ID'],'siteId':cfg['HOTSPOT_SITE_ID'],
          'deviceId':cfg['HOTSPOT_DEVICE_ID'],'eventId':uuid.uuid4().hex,
          'observedAtMs':int(time.time()*1000),'metrics':metrics}
    raw=json.dumps(body,separators=(',',':')).encode('utf-8')
    signature=hmac.new(cfg['HOTSPOT_DEVICE_SECRET'].encode('utf-8'),
                       raw,hashlib.sha256).hexdigest()
    request=urllib.request.Request(cfg['HOTSPOT_IOT_URL'],data=raw,
             headers={'Content-Type':'application/json',
                      'x-hotspot-iot-signature':signature},method='POST')
    with urllib.request.urlopen(request,timeout=10) as response:
        print(response.status,response.read().decode()[:300])

if __name__=='__main__':
    main()
