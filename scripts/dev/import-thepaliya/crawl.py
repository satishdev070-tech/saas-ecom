import re, urllib.request, hashlib, os, html, json, time
UA={"User-Agent":"Mozilla/5.0 (Macintosh) PaliyaMigration/1.0"}
def get(u):
    p="pages/"+hashlib.md5(u.encode()).hexdigest()[:12]+".html"
    if os.path.exists(p): return open(p,encoding="utf-8",errors="ignore").read()
    for i in range(3):
        try:
            import subprocess
            r=subprocess.run(["curl","-sL","--max-time","40","-A",UA["User-Agent"],u],capture_output=True,check=True); d=r.stdout.decode("utf-8","ignore"); open(p,"w").write(d); time.sleep(0.3); return d
        except Exception as e: err=e; time.sleep(1)
    print("FAIL",u,err); return ""
os.makedirs("pages",exist_ok=True)
seen=set(); queue=["https://thepaliya.com/","https://thepaliya.com/shop_all"]; products=set()
LIST=re.compile(r'https://thepaliya\.com/(?:category\?[^"\'\s<>]*|main/category\?[^"\'\s<>]*|main/products-[a-z-]+|shop_all(?:\?[^"\'\s<>]*)?|categories)')
while queue:
    u=queue.pop(0)
    if u in seen: continue
    seen.add(u); d=get(u)
    for m in re.findall(r'https://thepaliya\.com/products/[a-z0-9-]+',d): products.add(m)
    for m in LIST.findall(d):
        m=html.unescape(m)
        if m not in seen and len(seen)<200: queue.append(m)
json.dump(sorted(products),open("product_urls.json","w"),indent=1)
print(len(seen),"listing pages;",len(products),"products")
