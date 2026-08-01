import os

src_dir = r"D:\RCMS\old_portal\src"

converted = []
for root, dirs, files in os.walk(src_dir):
    for f in files:
        if f.endswith(".jsx"):
            old_path = os.path.join(root, f)
            new_path = os.path.join(root, f[:-4] + ".tsx")
            if os.path.exists(new_path):
                os.remove(old_path)
                print(f"Removed redundant {old_path} (already had .tsx)")
            else:
                os.rename(old_path, new_path)
                print(f"Renamed {old_path} -> {new_path}")
                converted.append((old_path, new_path))

print(f"Done converting {len(converted)} files to .tsx")
