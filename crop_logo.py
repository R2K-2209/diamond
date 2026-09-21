import sys
from PIL import Image

def process_logo(input_path, output_path, ico_path):
    print(f"Opening {input_path}")
    img = Image.open(input_path).convert("RGBA")
    
    # Get bounding box of non-transparent pixels
    bbox = img.getbbox()
    if not bbox:
        print("Image is entirely transparent!")
        sys.exit(1)
        
    print(f"Original size: {img.size}, Bounding box: {bbox}")
    
    # Crop to bounding box
    cropped = img.crop(bbox)
    
    # Calculate dimensions for a perfect square
    w, h = cropped.size
    size = max(w, h)
    
    # Remove all padding so it fills the entire taskbar square
    padding = 0
    new_size = size + (padding * 2)
    
    # Create new transparent square image
    square_img = Image.new("RGBA", (new_size, new_size), (0, 0, 0, 0))
    
    # Paste the cropped image precisely in the center
    paste_x = (new_size - w) // 2
    paste_y = (new_size - h) // 2
    square_img.paste(cropped, (paste_x, paste_y))
    
    # Save the beautifully centered PNG (original colors)
    print(f"Saving centered PNG to {output_path}")
    square_img.save(output_path, format="PNG")
    
    # Enhance the image for the taskbar so it doesn't blend into dark mode
    from PIL import ImageEnhance
    enhancer_color = ImageEnhance.Color(square_img)
    img_color = enhancer_color.enhance(1.5) # Boost saturation 50%
    
    enhancer_bright = ImageEnhance.Brightness(img_color)
    img_bright = enhancer_bright.enhance(1.4) # Boost brightness 40%
    
    enhancer_contrast = ImageEnhance.Contrast(img_bright)
    img_contrast = enhancer_contrast.enhance(1.2) # Boost contrast 20%
    
    # Save as ICO for the Windows taskbar
    print(f"Saving ICO to {ico_path}")
    img_contrast.save(ico_path, format="ICO", sizes=[(256, 256), (128, 128), (64, 64), (32, 32), (16, 16)])
    
    print("Success!")

if __name__ == "__main__":
    process_logo("Logo.png", "Logo_cropped.png", "logo.ico")
