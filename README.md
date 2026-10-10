# Khoa Học Mở Lối — IceCube / Nobel Vật lý 2026

Dự án HyperFrames dựng video khoa học dọc bằng tiếng Việt về neutrino năng lượng cao, Đài quan sát IceCube và đóng góp của Francis Halzen. Kịch bản, storyboard, prompt sản xuất, phụ đề, âm thanh và toàn bộ scene HTML đều nằm trong repository này.

## Bản dựng

- Khung hình dọc 1080 × 1920, 30 fps, dài 309,406 giây (5 phút 9,4 giây), gồm 24 cảnh kể chuyện và outro thương hiệu 6 giây.
- 18 cảnh khoa học dùng Three.js r159; 6 cảnh dùng ảnh tư liệu. GSAP điều khiển timeline seek-safe của HyperFrames.
- Lời dẫn tiếng Việt dùng Google Cloud TTS, giọng vi-VN-Chirp3-HD-Charon. Hai file narration.wav và score.wav đã được lưu sẵn để render lại mà không cần gọi TTS.
- Prompt đầy đủ và nguyên văn lời dẫn nằm trong PRODUCTION_PROMPT.md. SCRIPT.json là bản kịch bản dữ liệu chuẩn; subtitles.srt là phụ đề.

## Mở, kiểm tra và render

Cần Node.js, npm, Python 3, FFmpeg và FFprobe trong PATH. Trong PowerShell, tại thư mục repository:

    npm ci
    npm run check
    New-Item -ItemType Directory -Force .\out | Out-Null
    npm run render -- --fps 30 --quality delivery --crf 20 --workers 1 --experimental-fast-capture=false --output .\out\khoa-hoc-mo-loi-icecube-charon.mp4

Có thể xem project trong trình duyệt bằng npm run dev. Thư mục out, render segments và cache đều được gitignore. File MP4 dài được tạo cục bộ khi chạy lệnh render, không nằm trong lịch sử Git.

## Dựng lại lời dẫn và timeline từ kịch bản

Bản clone có sẵn narration.wav và score.wav. Để tự tổng hợp lại lời dẫn cần quyền Google Cloud Text-to-Speech và Application Default Credentials trên máy dựng; không có credential nào được lưu trong repository.

    python -m pip install -r requirements-google-tts.txt
    gcloud auth application-default login
    python google_tts.py --all
    python build_timeline.py
    python build_scenes.py
    python build_branding.py
    npm run check

NARRATION.json lưu tên giọng và tham số tổng hợp. Lệnh TTS gọi dịch vụ Google Cloud theo credential trên máy của bạn.

## Cấu trúc source

- index.html và compositions/ — composition gốc và các scene con.
- assets/3d/ — renderer dùng chung và 18 scene Three.js.
- assets/images/ — tư liệu ảnh đã dùng và tư liệu nguồn của các scene.
- assets/audio/narration.wav, score.wav — hai track âm thanh cuối.
- SCRIPT.json, SCENES.json, CUES.json, CAPTIONS.json, TIMINGS.json — kịch bản và dữ liệu timeline.
- ASSETS.json và ASSET_CREDITS.md — nguồn tư liệu, ghi công và ghi chú giấy phép.
- PRODUCTION_PROMPT.md — prompt hoàn chỉnh có thể tái sử dụng.
- brand/avatar-tiktok.png — avatar TikTok dấu hỏi mở đã chọn. Avatar profile tách riêng với dấu thương hiệu trong video.

## Nguyên tắc hình ảnh và độ chính xác

Dùng nền xanh mực, trắng băng và hổ phách; phụ đề là lớp chữ chính. Không đặt thanh tiêu đề, số cảnh, nhãn lưu trữ, đường tiến độ hoặc khung ảnh cố định. Chuyển động phải nối ý với lời dẫn; các mô phỏng 3D không được trình bày như footage quan sát trực tiếp.

Số 5.160 cảm biến chỉ mô tả cấu hình IceCube ban đầu. Kết quả 28 sự kiện năm 2013 là bằng chứng cho một thành phần neutrino ngoài khí quyển khi xét tập hợp, không phải khẳng định từng sự kiện đều có nguồn vũ trụ. Sự kiện năm 2017 và blazar được mô tả là mối liên hệ có bằng chứng đa sứ giả. Ảnh Super-Kamiokande là ảnh một ống nhân quang trưng bày tại bảo tàng; ảnh KM3NeT là module cảm biến quang học, không phải ảnh toàn bộ máy dò dưới biển.

## Nguồn tư liệu

Xem ASSET_CREDITS.md và ASSETS.json trước khi tái sử dụng ảnh. Credit ảnh nằm trong mô tả video theo lựa chọn của chủ kênh, không phủ lên khung hình. Có tư liệu có giấy phép mở và có tư liệu thuộc quyền của tổ chức/nhà ảnh; việc có bản sao trong project không đồng nghĩa các ảnh ấy được cấp phép phân phối lại công khai.
