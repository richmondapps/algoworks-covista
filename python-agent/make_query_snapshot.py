from pathlib import Path
from datetime import datetime, timezone
from PIL import Image, ImageDraw, ImageFont

out_dir = Path('query_outputs')
latest_txt = max(out_dir.glob('non_reserved_with_reserve_date_*.txt'), key=lambda p: p.stat().st_mtime)
lines = latest_txt.read_text(encoding='utf-8').splitlines()

# Keep header + first 30 result rows to make it readable as a screenshot.
header_lines = lines[:4]
data_lines = lines[4:34]
render_lines = header_lines + data_lines

font = ImageFont.load_default()
line_height = 18
padding = 14
width = 1600
height = padding * 2 + line_height * (len(render_lines) + 2)

img = Image.new('RGB', (width, height), 'white')
draw = ImageDraw.Draw(img)

y = padding
for line in render_lines:
    draw.text((padding, y), line, fill='black', font=font)
    y += line_height

stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
png_path = out_dir / f'non_reserved_with_reserve_date_snapshot_{stamp}.png'
img.save(png_path)
print(f'Snapshot saved: {png_path.resolve()}')
print(f'Source TXT: {latest_txt.resolve()}')
