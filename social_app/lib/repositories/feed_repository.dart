import 'package:flutter/foundation.dart';
import '../models/post.dart';
import '../models/comment.dart';

class FeedRepository extends ChangeNotifier {
  final List<Post> _posts = <Post>[
    Post(
      id: 'p1',
      authorId: 'u1',
      authorName: 'Alice',
      content: 'Welcome to the app! 🎉',
      createdAt: DateTime.now().subtract(const Duration(minutes: 15)),
    ),
    Post(
      id: 'p2',
      authorId: 'u2',
      authorName: 'Bob',
      content: 'Nice day to build Flutter apps.',
      imageUrl: 'https://picsum.photos/seed/flutter/640/360',
      createdAt: DateTime.now().subtract(const Duration(hours: 2)),
    ),
  ];

  // Track likes and comments per post
  final Map<String, Set<String>> _postLikes = <String, Set<String>>{}; // postId -> userIds
  final Map<String, List<Comment>> _postComments = <String, List<Comment>>{}; // postId -> comments

  List<Post> get posts {
    final List<Post> copy = List<Post>.from(_posts);
    copy.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return List<Post>.unmodifiable(copy);
  }

  List<Post> postsForUser(String userId) {
    final List<Post> filtered = _posts.where((p) => p.authorId == userId).toList();
    filtered.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return List<Post>.unmodifiable(filtered);
  }

  void createPost({
    required String authorId,
    required String authorName,
    required String content,
    String? imageUrl,
  }) {
    final Post newPost = Post(
      id: DateTime.now().microsecondsSinceEpoch.toString(),
      authorId: authorId,
      authorName: authorName,
      content: content.trim(),
      imageUrl: (imageUrl != null && imageUrl.trim().isEmpty) ? null : imageUrl?.trim(),
      createdAt: DateTime.now(),
    );
    _posts.add(newPost);
    notifyListeners();
  }

  // Post lookup
  Post? getPostById(String postId) {
    for (final Post post in _posts) {
      if (post.id == postId) return post;
    }
    return null;
  }

  // Likes API
  int likeCount(String postId) {
    return _postLikes[postId]?.length ?? 0;
  }

  bool isLikedByUser(String postId, String userId) {
    return _postLikes[postId]?.contains(userId) ?? false;
  }

  void toggleLike({required String postId, required String userId}) {
    final Set<String> likedBy = _postLikes.putIfAbsent(postId, () => <String>{});
    if (!likedBy.remove(userId)) {
      likedBy.add(userId);
    }
    notifyListeners();
  }

  // Comments API
  List<Comment> commentsForPost(String postId) {
    final List<Comment> list = _postComments[postId] ?? const <Comment>[];
    // newest last for chat-like ordering
    return List<Comment>.unmodifiable(list);
  }

  void addComment({
    required String postId,
    required String authorId,
    required String authorName,
    required String text,
  }) {
    final String trimmed = text.trim();
    if (trimmed.isEmpty) return;
    final Comment comment = Comment(
      id: DateTime.now().microsecondsSinceEpoch.toString(),
      postId: postId,
      authorId: authorId,
      authorName: authorName,
      text: trimmed,
      createdAt: DateTime.now(),
    );
    final List<Comment> list = _postComments.putIfAbsent(postId, () => <Comment>[]);
    list.add(comment);
    notifyListeners();
  }
}
