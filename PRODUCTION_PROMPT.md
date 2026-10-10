# Prompt sản xuất hoàn chỉnh — Khoa Học Mở Lối

Hãy làm việc như một đạo diễn phim tài liệu khoa học, biên tập viên lời dẫn tiếng Việt, motion designer và kỹ sư HyperFrames. Hoàn thiện một video TikTok dọc giàu tính kể chuyện về neutrino năng lượng cao, IceCube và Nobel Vật lý 2026 của Francis Halzen. Dự án đã có kịch bản, storyboard và composition; khi tiếp tục, hãy lấy các file này làm nguồn chuẩn và bảo toàn nội dung đã duyệt.

## Mục tiêu và người xem

Giải thích cho người xem phổ thông vì sao neutrino có thể mang manh mối từ các sự kiện vũ trụ, vì sao việc phát hiện chúng khó, cách các máy dò nước và băng ghi nhận tương tác, và IceCube đã mở rộng quan sát ấy ra sao. Câu chuyện đi từ hiện tượng sao đến neutrino, các phương pháp dò trên Trái Đất, IceCube, bằng chứng thiên văn đa sứ giả, rồi công trình được ghi nhận bằng Nobel. Dẫn nhập từ rộng tới hẹp; nêu các máy dò khác sau khi người xem đã hiểu neutrino có ý nghĩa gì.

## Định dạng và giao phẩm

- Video 1080 × 1920, 9:16, 30 fps, tiếng Việt, thời lượng composition 309,406 giây gồm outro 6 giây.
- Lời dẫn nam vi-VN-Chirp3-HD-Charon; nhạc nền nguyên bản tiết chế, duck dưới lời nói, thêm điểm nhấn âm thanh nhẹ ở vụ nổ và các khoảnh khắc khám phá.
- Subtitles.srt là phụ đề đã căn thời gian. Chú thích trên hình giữ câu ngắn, tối đa hai dòng, không dấu câu theo thiết kế hiện tại.
- Dùng HyperFrames, GSAP và Three.js cục bộ; animation phải seek-safe, deterministic, và chỉ phụ thuộc thời gian của timeline.
- Hoàn tất bằng một bản MP4 có tiếng, source project, phụ đề, README và prompt sản xuất.

## Chỉ đạo hình ảnh

Tạo cảm giác phim tài liệu khoa học được thiết kế riêng: nền xanh mực, trắng băng, hổ phách dành cho tín hiệu, ánh sáng và vật liệu có chiều sâu, silhouette rõ, chuyển động máy quay có chủ đích. Kết hợp mô phỏng 3D với ảnh tư liệu thật ở đúng bối cảnh. Phần mở đầu cho thấy Betelgeuse, sự sụp lõi, vụ nổ và sự khác nhau giữa tín hiệu hạt thoát ra sớm với ánh sáng đến muộn; không gọi tên neutrino trước khi lời dẫn tiết lộ.

Giữ khung hình như một bộ phim, không như slide: không tiêu đề thường trực, số thứ tự, huy hiệu tư liệu, thanh tiến độ, footer, viền ảnh hay chú giải trang trí. Phụ đề là chữ xuất hiện thường xuyên nhất. Chỉ hiện tên, con số hoặc sơ đồ ngắn đúng lúc lời dẫn giải thích. Dùng ảnh full-frame với crop và chuyển động máy quay tinh tế. Các cảnh nối bằng hướng chuyển động, hình dạng, ánh sáng hoặc điểm nhìn chung; tránh flash lặp lại, whip vô cớ và cắt sang màn đen.

Dùng Three.js trong 18 cảnh mô phỏng: Betelgeuse/sụp lõi/đường tới Trái Đất; neutrino và cơ chế tương tác; cơ thể và lõi Mặt Trời; quy mô máy dò nước; chuyển từ vật chất nền tự nhiên tới băng Nam Cực; cấu trúc IceCube; cảm biến và thể tích; ánh sáng Cherenkov; thời gian tín hiệu; sự kiện năm 2013; quét bầu trời, cảnh báo 2017 và blazar. Sáu cảnh tư liệu tương ứng gồm máy dò khác, Francis Halzen, khoan và thả DOM, nhóm IceCube/Nobel, và kết đoạn bằng IceCube/vũ trụ. Dựa vào compositions/ và STORYBOARD.md để bảo toàn thứ tự và chuyển cảnh hiện có.

Ảnh máy dò Super-Kamiokande trong nguồn hiện tại là một photomultiplier trưng bày tại bảo tàng, không phải bể detector đang vận hành. Ảnh KM3NeT hiện tại là module quang học, không phải toàn cảnh detector dưới biển. Không hoán đổi hoặc gán sai địa điểm cho ảnh tư liệu. Tôn trọng thông tin credit trong ASSETS.json; để credit trong mô tả đăng video, không chèn credit phủ lên hình. Outro 6 giây chỉ có nhận diện kênh, tên Khoa Học Mở Lối và bio “Kể chuyện khoa học, mở thêm góc nhìn về thế giới.”

## Kiểm soát khoa học

- Neutrino không mang điện, khối lượng rất nhỏ và tương tác yếu; không nói chúng đi nhanh hơn ánh sáng.
- Trong sụp lõi sao, neutrino thoát khỏi vùng lõi trước khi sóng xung kích tới bề mặt và ánh sáng khả kiến xuất hiện; đây không vi phạm giới hạn tốc độ ánh sáng.
- Neutrino năng lượng cao tạo hạt thứ cấp mang điện khi tương tác. Ánh sáng Cherenkov xuất hiện khi hạt thứ cấp đi nhanh hơn tốc độ ánh sáng trong môi trường; không nhanh hơn ánh sáng trong chân không.
- Cấu hình IceCube ban đầu có 5.160 cảm biến trong khoảng 1 km³; ghi rõ đó là cấu hình ban đầu.
- Kết quả 28 sự kiện năm 2013 cung cấp bằng chứng cho thành phần neutrino ngoài khí quyển khi phân tích tập hợp; không khẳng định mọi sự kiện đều là neutrino vũ trụ.
- Sự kiện IceCube-170922A và TXS 0506+056 được kể như một mối liên hệ có bằng chứng từ quan sát đa sứ giả, không tuyên bố nguồn đã được xác định chắc chắn chỉ bằng một phép đo.
- IceCube bổ sung cho các máy dò khác. Khí quyển vẫn tạo nền neutrino và hạt gây nhiễu; detector dưới biển đối diện ánh sáng nền trong nước.
- Ghi nhận đóng góp của Halzen cùng cộng đồng nhà khoa học, kỹ sư và kỹ thuật viên quốc tế.

## Quy tắc nội dung

Giữ nguyên lời dẫn chuẩn dưới đây. Không tự rút gọn, diễn giải lại hoặc thay script đã duyệt. Nếu cần thay đổi câu chữ hoặc độ dài, đề nghị để chủ kênh duyệt trước. Không biến các mô phỏng minh họa thành tuyên bố footage thật. Không bịa số liệu hoặc nguồn. Tránh hình ảnh chung chung, hạt bay vô nghĩa, đồ họa neon đại trà và thẩm mỹ “AI slop”.

## Kịch bản lời dẫn chuẩn

- p01: Đây là Betelgeuse, một ngôi sao siêu khổng lồ đỏ trên vai gã thợ săn Orion, mà bạn có thể quan sát bằng mắt thường trên bầu trời đêm. Nếu đặt nó vào vị trí của Mặt Trời, bề mặt của nó sẽ vượt qua cả quỹ đạo của Trái Đất lẫn sao Hỏa. Những ngôi sao lớn như vậy không lụi tàn lặng lẽ. Chúng kết thúc cuộc đời bằng một vụ nổ dữ dội. Khi Betelgeuse phát nổ, ánh sáng của nó sẽ lan qua không gian, và khi tới Trái Đất, nó sẽ bừng lên trên bầu trời, sáng gần như Mặt Trăng, nhìn thấy được cả ban ngày.
- p02: Thế nhưng, chúng ta có thể biết vụ nổ ấy đã xảy ra trước cả khi nhìn thấy ánh sáng của nó.
- p03: Khi lõi một ngôi sao lớn sụp đổ, nó giải phóng một dòng hạt có thể xuyên qua các lớp vật chất và thoát ra rất nhanh. Còn ánh sáng của vụ nổ xuất hiện muộn hơn, khi sóng xung kích lan tới bề mặt ngôi sao.
- p04: Chính dòng hạt ấy có thể mang tới dấu hiệu đầu tiên về vụ nổ, trước khi chúng ta nhìn thấy nó.
- p05: Những hạt ấy được gọi là neutrino.
- p06: Đây là một loại hạt cơ bản, không mang điện và có khối lượng rất nhỏ. Neutrino hiếm khi tương tác với vật chất, nên chúng thường đi xuyên qua mà chẳng để lại dấu vết.
- p07: Ngay lúc này, rất nhiều neutrino sinh ra trong Mặt Trời đang xuyên qua cơ thể bạn. Bạn chẳng cảm thấy gì, còn chúng cứ tiếp tục hành trình.
- p08: Đặc điểm khó phát hiện ấy khiến neutrino thường được gọi là “hạt ma”.
- p09: Khả năng xuyên qua vật chất cũng giúp neutrino mang thông tin từ sâu bên trong nguồn phát tới chúng ta.
- p10: Chẳng hạn, đo neutrino từ Mặt Trời giúp các nhà khoa học nghiên cứu những phản ứng đang diễn ra ở lõi nó. Với các neutrino năng lượng cao từ vũ trụ, năng lượng và hướng đến của chúng lại là manh mối để lần theo những nơi đang tạo ra các hạt mang năng lượng cực lớn.
- p11: Muốn đọc được những manh mối ấy, các nhà khoa học cần ghi nhận những lần neutrino tương tác với vật chất.
- p12: Một cách làm là dùng một lượng nước lớn, bao quanh bằng các cảm biến ánh sáng. Khi neutrino tương tác, những hạt mang điện sinh ra có thể phát ánh sáng trong nước. Các cảm biến ghi lại ánh sáng ấy để nhóm nghiên cứu tái dựng sự kiện.
- p13: Ở Nhật Bản, Super-Kamiokande dùng một bể chứa năm mươi nghìn tấn nước dưới lòng đất. Còn tại Địa Trung Hải, các mạng dò của KM3NeT được đặt trong nước biển sâu; mạng ARCA cũng hướng tới neutrino năng lượng cao từ vũ trụ.
- p14: Với những neutrino vũ trụ rất hiếm ấy, cần quan sát một thể tích vật chất đủ lớn để tăng cơ hội phát hiện.
- p15: Có tín hiệu rồi vẫn phải xác định nó đến từ đâu, bởi khí quyển cũng tạo ra neutrino và những hạt gây nhiễu. Máy dò dưới biển còn phải xử lý ánh sáng nền trong nước.
- p16: Riêng bài toán quy mô gợi ra một hướng giải quyết: tận dụng những khối vật chất khổng lồ đã có sẵn trong tự nhiên. Các dự án dưới biển dùng nước; còn một lựa chọn khác nằm ở lớp băng sâu của Nam Cực.
- p17: Từ cuối những năm 1980, Francis Halzen — một nhà vật lý tại Đại học Wisconsin–Madison ở Mỹ — đã theo đuổi hướng dùng băng này. Ông nhận ra lớp băng sâu có thể cung cấp một thể tích quan sát rất lớn, với những vùng đủ trong để ánh sáng truyền tới các cảm biến.
- p18: Nếu đưa thiết bị xuống đó, chính lớp băng sẽ trở thành một phần của máy dò. Từ ý tưởng ấy, IceCube ra đời.
- p19: Để lắp đặt thiết bị, các kỹ sư dùng nước nóng khoan những lỗ sâu gần hai cây số rưỡi. Họ thả xuống các dây mang cảm biến, rồi để nước đóng băng trở lại.
- p20: Trong cấu hình ban đầu, hơn năm nghìn cảm biến được bố trí trong khoảng một kilômét khối băng.
- p21: IceCube ghi nhận ánh sáng sinh ra khi neutrino tương tác. Trong băng, ánh sáng truyền chậm hơn trong chân không. Các hạt mang điện có thể vượt qua tốc độ ánh sáng trong môi trường này và phát ra ánh sáng Cherenkov.
- p22: Thời điểm và lượng ánh sáng tại từng cảm biến giúp nhóm nghiên cứu ước tính năng lượng và tái dựng hướng đi của sự kiện.
- p23: Từ những phép đo ấy, nhóm nghiên cứu tìm các sự kiện có đặc điểm phù hợp với nguồn phát ngoài Trái Đất.
- p24: Năm 2013, IceCube công bố kết quả phân tích hai mươi tám sự kiện năng lượng cao. Xét chúng cùng nhau, các nhà khoa học tìm thấy bằng chứng về một thành phần neutrino mà tín hiệu nền khí quyển không đủ để giải thích.
- p25: Kết quả đó mở đường cho việc dùng IceCube nghiên cứu neutrino năng lượng cao từ vũ trụ. Bước tiếp theo là tìm nguồn phát cụ thể.
- p26: Một cơ hội xuất hiện vào năm 2017, khi IceCube ghi nhận một sự kiện neutrino năng lượng cao và phát đi cảnh báo.
- p27: Dựa vào hướng được tái dựng, các kính thiên văn khác cùng quan sát vùng trời liên quan. Ở đó có một thiên hà hoạt động thuộc loại blazar, nơi vùng quanh một lỗ đen siêu khối lượng tạo ra những luồng vật chất mạnh mẽ.
- p28: Kết hợp dữ liệu neutrino với các quan sát khác, những nghiên cứu công bố năm 2018 đưa ra bằng chứng liên hệ sự kiện này với blazar ấy.
- p29: Dấu vết dưới băng đã giúp các nhà khoa học lần theo một nguồn phát khả dĩ ở rất xa.
- p30: Manh mối về blazar ấy là kết quả của nhiều năm xây dựng thiết bị, đo đạc và phân tích dữ liệu. Để một chớp sáng dưới băng trở thành thông tin về vũ trụ, các nhà nghiên cứu phải hiểu ánh sáng đã truyền qua băng như thế nào, rồi tái dựng tương tác tạo ra nó.
- p31: Halzen góp phần định hướng và dẫn dắt công trình ấy, cùng một cộng đồng nhà khoa học, kỹ sư và kỹ thuật viên quốc tế. Những đóng góp quyết định của ông cho IceCube và việc phát hiện neutrino năng lượng cao từ vũ trụ đã được ghi nhận bằng Nobel Vật lý 2026.
- p32: Nhờ IceCube, những tương tác hiếm hoi của neutrino trở thành dữ liệu giúp chúng ta lần theo các nguồn phát ở rất xa.
- p33: Và từ những chớp sáng nằm sâu dưới băng Nam Cực, chúng ta đang học thêm về những điều xảy ra ngoài vũ trụ.
