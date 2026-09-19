import cv2, numpy as np
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODELS = {
    "09": ("product-1-99-20260706000851-a4d842.webp", (330, 330, 1070, 1260), 42),
    "10": ("product-1-1010-20260706000934-a00e6c.webp", (330, 330, 1070, 1260), 59),
    "11": ("product-1-1111-20260706001045-b19fff.webp", (360, 560, 1040, 1260), 38),
}

for model, (name, roi, expected) in MODELS.items():
    im = cv2.imread(str(ROOT / "assets/optimized/products/gallery" / name))
    b, g, r = cv2.split(im)
    x0, y0, x1, y1 = roi
    best = []
    for lum_max in (110, 125, 140, 155, 170, 185):
      for rb_min in (8, 12, 16, 20, 24):
       for near in (1, 2, 3):
        lum = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
        brown = ((lum < lum_max) & ((r.astype(np.int16)-b.astype(np.int16)) > rb_min) & ((r.astype(np.int16)-g.astype(np.int16)) > 2)).astype(np.uint8)
        dark = (lum < 80).astype(np.uint8)
        support = cv2.dilate(brown, np.ones((near*2+1, near*2+1), np.uint8))
        line = ((brown > 0) | ((dark > 0) & (support > 0))).astype(np.uint8)
        barrier = cv2.dilate(line, np.ones((5,5), np.uint8))
        open_area = (1-barrier[y0:y1,x0:x1]).astype(np.uint8)
        n, labels, stats, cent = cv2.connectedComponentsWithStats(open_area, 4)
        count=0; areas=[]
        h,w=open_area.shape
        for i in range(1,n):
          x,y,ww,hh,area=stats[i]
          touch=x<=1 or y<=1 or x+ww>=w-1 or y+hh>=h-1
          if not touch and 160 <= area <= 100000:
            count+=1; areas.append(area)
        best.append((abs(count-expected),count,lum_max,rb_min,near,min(areas or [0]),max(areas or [0])))
    print(model, sorted(best)[:12])

    if model == "11":
      lum = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
      brown = ((lum < 140) & ((r.astype(np.int16)-b.astype(np.int16)) > 8) & ((r.astype(np.int16)-g.astype(np.int16)) > 2)).astype(np.uint8)
      support = cv2.dilate(brown, np.ones((3,3), np.uint8))
      line = ((brown > 0) | ((lum < 80) & (support > 0))).astype(np.uint8)
      barrier = cv2.dilate(line, np.ones((5,5), np.uint8))
      open_area = (1-barrier[y0:y1,x0:x1]).astype(np.uint8)
      n, labels, stats, cent = cv2.connectedComponentsWithStats(open_area, 4)
      vis=im.copy(); overlay=np.zeros_like(im); chosen=[]
      for i in range(1,n):
        x,y,ww,hh,area=stats[i]; touch=x<=1 or y<=1 or x+ww>=open_area.shape[1]-1 or y+hh>=open_area.shape[0]-1
        if not touch and 160 <= area <= 100000:
          chosen.append((i,cent[i][0]+x0,cent[i][1]+y0,area))
          overlay[y0:y1,x0:x1][labels==i]=((i*83)%255,(i*137)%255,(i*59)%255)
      vis=cv2.addWeighted(vis,0.5,overlay,0.5,0)
      for j,(i,cx,cy,area) in enumerate(sorted(chosen,key=lambda q:(q[2],q[1])),1):
        cv2.putText(vis,str(j),(round(cx)-8,round(cy)+6),cv2.FONT_HERSHEY_SIMPLEX,.5,(255,255,255),3,cv2.LINE_AA)
        cv2.putText(vis,str(j),(round(cx)-8,round(cy)+6),cv2.FONT_HERSHEY_SIMPLEX,.5,(0,0,0),1,cv2.LINE_AA)
      cv2.imwrite(str(Path(__file__).with_name("yota-11-base-components.png")),vis)
