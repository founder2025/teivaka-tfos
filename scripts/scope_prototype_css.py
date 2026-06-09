import re
css = open('/tmp/proto.css').read()
css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
PREFIX = '.tfp'
out = []
sel = ''
stack = ['top']

def prefix_selectors(s):
    parts = [p.strip() for p in s.split(',') if p.strip()]
    res = []
    for p in parts:
        if p.startswith(':root'):
            res.append(p)
        elif p in ('html', 'body'):
            res.append(PREFIX)
        elif p == '*':
            res.append(PREFIX + ' *')
        elif p.startswith('@'):
            res.append(p)
        else:
            res.append(PREFIX + ' ' + p)
    return ', '.join(res)

for ch in css:
    ctx = stack[-1]
    if ctx == 'rule':                  # inside declarations — pass through
        out.append(ch)
        if ch == '}':
            stack.pop()
    else:
        if ch == '{':
            s = sel.strip()
            if s.startswith('@keyframes') or s.startswith('@-webkit-keyframes'):
                out.append(s + '{'); stack.append('keyframes')
            elif s.startswith('@'):
                out.append(s + '{'); stack.append('media')
            else:
                if ctx == 'keyframes':
                    out.append(s + '{')                 # keyframe step
                else:
                    out.append('\n' + prefix_selectors(s) + ' {')
                stack.append('rule')
            sel = ''
        elif ch == '}':
            out.append('}\n')
            if len(stack) > 1: stack.pop()
            sel = ''
        else:
            sel += ch

open('/tmp/proto.scoped.css', 'w').write(''.join(out))
txt = ''.join(out)
print("output bytes:", len(txt), " rules:", txt.count('{'))
