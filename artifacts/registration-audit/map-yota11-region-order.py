import json, numpy as np
from pathlib import Path

root=Path(__file__).resolve().parents[2]
old=json.load(open(Path.home()/"AppData/Local/Temp/yota11-v4-regions.json",encoding="utf8"))["regions"]
new=json.load(open(root/"coloring/yota-11/regions.json",encoding="utf8"))["regions"]
H=np.array([[.926187696,-.032899601,37.42873],[-.025869704,.912338942,42.22556],[-.000030377,-.000045028,1]])
pred={}
for r in old:
 p=H@np.array([r["centerX"],r["centerY"],1.]); pred[int(r["id"].split("-")[1])]=p[:2]/p[2]
cent={int(r["id"].split("-")[1]):np.array([r["centerX"],r["centerY"]]) for r in new}
mapping={18:22,20:18}; used_old=set(mapping); used_new=set(mapping.values())
pairs=[]
for oi,p in pred.items():
 if oi in used_old: continue
 for ni,c in cent.items():
  if ni in used_new: continue
  pairs.append((float(np.linalg.norm(p-c)),oi,ni))
for d,oi,ni in sorted(pairs):
 if oi not in used_old and ni not in used_new:
  mapping[oi]=ni; used_old.add(oi); used_new.add(ni)
print("new order indexes for old ids:", [mapping[i] for i in range(1,39)])
print("distances:")
for oi in range(1,39): print(oi,"<-",mapping[oi],round(float(np.linalg.norm(pred[oi]-cent[mapping[oi]])),1))
