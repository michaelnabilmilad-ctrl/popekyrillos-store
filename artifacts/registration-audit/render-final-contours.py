import cv2, numpy as np
from pathlib import Path

root=Path(__file__).resolve().parents[2]
for model, threshold in (("09",110),("10",125),("11",137)):
 base=cv2.imread(str(root/f"coloring/yota-{model}/base.png"))
 mask=cv2.imread(str(root/f"coloring/yota-{model}/regions.png"),cv2.IMREAD_UNCHANGED)
 alpha=mask[:,:,3]
 ids=mask[:,:,0].astype(np.int32)+(mask[:,:,1].astype(np.int32)<<8)+(mask[:,:,2].astype(np.int32)<<16)
 contour=np.zeros(alpha.shape,np.uint8)
 for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
  shifted=np.roll(ids,(dy,dx),(0,1)); shifted_alpha=np.roll(alpha,(dy,dx),(0,1))
  contour |= ((alpha==255)&((shifted_alpha==0)|(shifted!=ids))).astype(np.uint8)
 vis=base.copy(); vis[contour>0]=(255,0,255)
 y0=930 if model!="09" else 920; y1=1240; x0=400; x1=1000
 crop=vis[y0:y1,x0:x1]
 cv2.imwrite(str(Path(__file__).with_name(f"yota-{model}-lower-contour-400pct.png")),cv2.resize(crop,None,fx=4,fy=4,interpolation=cv2.INTER_NEAREST))
 print(model,"partialAlpha",int(np.count_nonzero((alpha!=0)&(alpha!=255))),"lowerContourPixels",int(np.count_nonzero(contour[y0:y1,x0:x1])))
