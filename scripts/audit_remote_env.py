import sys

env = {}
try:
    with open('/etc/blessing.env', 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip().strip('"\'')
except Exception as e:
    print("Error reading /etc/blessing.env:", e)
    sys.exit(1)

rzp_id = env.get('RAZORPAY_KEY_ID', '')
if rzp_id.startswith('rzp_live_'):
    rzp_type = 'PRESENT (rzp_live_*)'
elif rzp_id.startswith('rzp_test_'):
    rzp_type = 'PRESENT (rzp_test_*)'
elif not rzp_id:
    rzp_type = 'MISSING'
else:
    rzp_type = 'INVALID FORMAT'

report = {
    'NODE_ENV': env.get('NODE_ENV', 'MISSING'),
    'HOSTING': env.get('HOSTING', 'MISSING'),
    'DATABASE_URL': 'PRESENT (postgresql://)' if env.get('DATABASE_URL', '').startswith('postgresql://') else 'MISSING/INVALID',
    'SESSION_SECRET': 'PRESENT (len >= 32)' if len(env.get('SESSION_SECRET', '')) >= 32 else 'WEAK/MISSING',
    'RAZORPAY_KEY_ID': rzp_type,
    'RAZORPAY_KEY_SECRET': 'PRESENT' if 'RAZORPAY_KEY_SECRET' in env and env['RAZORPAY_KEY_SECRET'] else 'MISSING',
    'RAZORPAY_WEBHOOK_SECRET': 'PRESENT' if 'RAZORPAY_WEBHOOK_SECRET' in env and env['RAZORPAY_WEBHOOK_SECRET'] else 'MISSING',
    'S3_BUCKET': 'PRESENT' if ('S3_BUCKET' in env and env['S3_BUCKET']) or ('R2_BUCKET' in env and env['R2_BUCKET']) else 'MISSING',
    'S3_ACCESS_KEY': 'PRESENT' if ('S3_ACCESS_KEY_ID' in env and env['S3_ACCESS_KEY_ID']) or ('AWS_ACCESS_KEY_ID' in env and env['AWS_ACCESS_KEY_ID']) else 'MISSING',
    'REDIS_URL': 'PRESENT' if 'REDIS_URL' in env and env['REDIS_URL'] else 'MISSING (Using local 127.0.0.1:6379)',
    'CLOUDINARY': 'PRESENT' if 'CLOUDINARY_CLOUD_NAME' in env and env['CLOUDINARY_CLOUD_NAME'] else 'MISSING',
    'PUBLIC_BASE_URL': env.get('PUBLIC_BASE_URL', 'MISSING'),
    'NEXT_PUBLIC_SITE_URL': env.get('NEXT_PUBLIC_SITE_URL', 'MISSING'),
    'GOOGLE_CLIENT_ID': 'PRESENT' if 'NEXT_PUBLIC_GOOGLE_CLIENT_ID' in env and env['NEXT_PUBLIC_GOOGLE_CLIENT_ID'] else 'MISSING',
    'GOOGLE_CLIENT_SECRET': 'PRESENT' if 'GOOGLE_CLIENT_SECRET' in env and env['GOOGLE_CLIENT_SECRET'] else 'MISSING',
}

for k, v in report.items():
    print(f"{k:25}: {v}")
