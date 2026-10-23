
import json, sys

with open(r'C:\Users\yoges\.gemini\antigravity-ide\brain\f0219d32-90ec-4922-a1e7-1622c4e073bd\.system_generated\logs\transcript.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        obj = json.loads(line)
        if obj.get('type') == 'USER_INPUT':
            print('USER_INPUT step:', obj.get('step_index'))
            content = str(obj.get('content'))
            print('length:', len(content))
            # look for media or file paths or base64
            import re
            matches = re.findall(r'(\S+\.(?:png|jpg|jpeg|webp))', content, re.I)
            print('matches:', matches)
