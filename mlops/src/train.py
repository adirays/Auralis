from ultralytics import YOLO

# 1. Load the 0.412 mAP model. It knows the basics; now we push it.
model = YOLO("/content/runs/obb/concrete_damage/yolo26s_obb_V6_Master/weights/best.pt")

model.train(
    data="/content/dataset/content/cracks-3/data.yaml", 
    epochs=150,         # Short, aggressive 50-epoch sprint
    batch=32,
    imgsz=640,
    
    # --- The Imbalance Fix ---
    image_weights=True, # FORCED: Forces the model to focus on Efflorescence and Corrosion
    
    # --- The Engine Room ---
    lr0=0.0001,        # Keep the micro-LR to protect the existing geometry
    optimizer='AdamW', 
    
    # --- Safe Variance (Breaking the "Too Clean" limit) ---
    scale=0.1,         # Safe zoom variance (depth perception)
    hsv_v=0.1,         # Safe brightness variance (time of day)
    hsv_h=0.0,         # STILL FORCED: Rust must remain orange
    hsv_s=0.0,         
    mosaic=0.0,        # STILL FORCED: No artificial stitching
    copy_paste=0.0,    
    
    # --- The Geometric Mandate ---
    degrees=15.0,      
    flipud=0.3,        
    fliplr=0.5,        
    
    project="concrete_damage",
    name="yolo26s_obb_V3_Breakthrough" 
)