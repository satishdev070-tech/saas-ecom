import re, json, html, subprocess, time
UA="Mozilla/5.0 (Macintosh) PaliyaMigration/1.0"
def curl(u, extra=[]):
    return subprocess.run(["curl","-sL","--max-time","40","-A",UA,*extra,u],capture_output=True).stdout.decode("utf-8","ignore")
def text(h):
    h=re.sub(r'<br\s*/?>','\n',h); h=re.sub(r'</(p|li|h\d|div)>','\n',h); h=re.sub(r'<li[^>]*>','• ',h)
    t=html.unescape(re.sub(r'<[^>]+>','',h))
    return re.sub(r'\n\s*\n+','\n\n',re.sub(r'[ \t\r]+',' ',t)).strip()
def tab(d, tid):
    m=re.search(r'id="'+tid+r'"[^>]*>(.*?)</div>\s*(?:<div class="tab-pane|</div>)',d,re.S)
    return m.group(1).strip() if m else ""
out=[]
for u in json.load(open("product_urls.json")):
    slug=u.rsplit("/",1)[1]
    d=curl(u); open(f"prod/{slug}.html","w").write(d)
    g=lambda pat: (re.search(pat,d,re.S).group(1).strip() if re.search(pat,d,re.S) else None)
    item_id=g(r'id="overview_item_id"\s+value="(\d+)"') or g(r'data-item_id="(\d+)"')
    title=html.unescape(g(r'aria-current="page">([^<]+)</li>') or "")
    crumbs=re.findall(r'breadcrumb-item">\s*<a[^>]*href="([^"]+)">([^<]+)</a>',d)
    gal_start=d.find('sp-loading'); gal_end=d.find('btn-video') if 'btn-video' in d else d.find('pills-description')
    gal=[]
    for m in re.findall(r'<img src="(https://thepaliya\.com/storage/admin-assets/images/product/[^"]+)"',d[gal_start:gal_end]):
        if m not in gal: gal.append(m)
    video=g(r'href="(https://thepaliya\.com/storage/admin-assets/images/product/[^"]+\.(?:mov|mp4|webm))"')
    sizes=re.findall(r'name="skills"[^>]*value="([^"]+)"',d)
    option_label=g(r'<label class="fw-semibold fs-6 mt-3 mb-0"\s*for="">([^<]+)</label>') or "Size"
    variants=[]
    for s in sizes:
        r=curl(f"https://thepaliya.com/get-products-variant-quantity?name%5B%5D={s}&item_id={item_id}&vendor_id=2",["-H","X-Requested-With: XMLHttpRequest"])
        try: j=json.loads(r)
        except: j={"error":r[:200]}
        variants.append({"value":s,**{k:j.get(k) for k in ("price","original_price","quantity","variant_id","is_available","stock_management","min_order","max_order")}})
        time.sleep(0.25)
    size_chart_html=tab(d,"pills-size_chart")
    sc_img=re.findall(r'src="(https://thepaliya\.com/storage/[^"]+)"',size_chart_html)
    rec={
      "old_id":item_id,"slug":slug,"url":u,"title":title,
      "price":g(r'id="overview_item_price"\s+value="([^"]*)"'),"original_price":g(r'id="overview_item_original_price"\s+value\s*="([^"]*)"'),
      "sku":g(r'id="sku">([^<]*)<'),"crumbs":[[html.unescape(n),l] for l,n in crumbs],
      "description_html":tab(d,"pills-description"),"additional_html":tab(d,"pills-additional_info"),
      "description":text(tab(d,"pills-description")),"additional":text(tab(d,"pills-additional_info")),
      "size_chart_images":sc_img,"size_chart_text":text(size_chart_html),
      "images":gal,"video":video,"option":option_label,"variants":variants,
      "tax_note":"Inclusive of all taxes" if "Inclusive of all taxes" in d else None,
      "meta_description":html.unescape(g(r'<meta name="description" content="([^"]*)"') or ""),
      "og_image":g(r'<meta property="og:image" content=["\']([^"\']+)'),
    }
    out.append(rec); print(slug,item_id,len(gal),"imgs",len(variants),"variants",rec["price"],rec["original_price"])
json.dump(out,open("products.json","w"),indent=1,ensure_ascii=False)
