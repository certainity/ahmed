class Post {
  final String id;
  final String authorId;
  final String authorName;
  final String content;
  final String? imageUrl;
  final DateTime createdAt;

  const Post({
    required this.id,
    required this.authorId,
    required this.authorName,
    required this.content,
    required this.createdAt,
    this.imageUrl,
  });
}
