import 'package:flutter/foundation.dart';
import '../models/post.dart';

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
}
