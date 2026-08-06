import urllib.request, json, base64, sys

url = 'http://orthanc:8042/modalities'
req = urllib.request.Request(url)
req.add_header('Authorization', 'Basic ' + base64.b64encode(b'rcms:rcms').decode())
try:
    resp = urllib.request.urlopen(req, timeout=5)
    print('Status:', resp.status)
    print('Body:', resp.read().decode()[:500])
except Exception as e:
    print('Error:', e)
    sys.exit(1)
