import re,html,sys
def main_html(d):
    d=re.sub(r'<script.*?</script>|<style.*?</style>|<!--.*?-->','',d,flags=re.S)
    a=d.find('</header>'); a=a if a>0 else 0
    b=d.find('<footer'); b=b if b>0 else len(d)
    return d[a:b]
def text(h):
    h=re.sub(r'<br\s*/?>','\n',h); h=re.sub(r'</(p|li|h\d|div|tr|section)>','\n',h); h=re.sub(r'<li[^>]*>','• ',h)
    t=html.unescape(re.sub(r'<[^>]+>',' ',h))
    t=re.sub(r'[ \t\r]+',' ',t); t=re.sub(r'\n\s*\n+','\n',t)
    return t.strip()
for f in sys.argv[1:]:
    print("=====",f); print(text(main_html(open(f).read()))[:6000])

def content(f):
    t=text(main_html(open(f).read()))
    i=t.rfind("Copyright © Webinnovate All Rights Reserved")
    return t[i+len("Copyright © Webinnovate All Rights Reserved"):].strip() if i>=0 else t
