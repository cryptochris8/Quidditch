# Free Broom 3D Model Resources

Resources for finding free broomstick 3D models in GLTF/GLB format for future use.

## Recommended Sources

### 1. **Sketchfab**
- **URL**: https://sketchfab.com/tags/broomstick
- **License**: Filter by "Downloadable" + "CC License"
- **Format**: GLTF/GLB export supported
- **Notes**: Good variety of free downloadable broomstick models

### 2. **IconScout**
- **URL**: https://iconscout.com/3d-illustrations/flying-witch-broom
- **Models**: 2,850+ flying witch broom 3D illustrations
- **Format**: GLTF format available
- **Notes**: Some free options, check licensing

### 3. **Kenney Assets**
- **URL**: https://kenney.nl/assets?q=3d
- **License**: CC0 (public domain)
- **Format**: GLB format included
- **Notes**: All-in-one pack available, likely has stick/tool models

### 4. **Poly Haven**
- **URL**: https://polyhaven.com/models
- **License**: CC0 licensed (completely free)
- **Format**: GLTF/GLB/FBX/USD available
- **Notes**: High-quality PBR models with up to 8K textures

### 5. **Khronos GLTF Sample Models**
- **URL**: https://github.com/KhronosGroup/glTF-Sample-Models
- **License**: Various (check per model)
- **Format**: GLTF/GLB
- **Notes**: Official sample models repository

## Current Implementation

**Currently using**: `models/items/fishing-rod.gltf`
- Available in project assets
- Works well as a broomstick when rotated/scaled
- Can be easily replaced with any of the above models later

## How to Replace the Broom Model

1. Download a `.gltf` or `.glb` file from one of the sources above
2. Place it in `assets/models/items/` folder
3. Update the `modelUri` in the broom entity code (search for "fishing-rod.gltf")
4. Adjust scale and rotation as needed

---

*Saved: 2025-10-26*
