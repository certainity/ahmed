import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/auth_providers.dart';
import '../../providers/feed_providers.dart';
import '../feed/widgets/post_card.dart';

class ProfileScreen extends ConsumerWidget {
  final String userId;
  const ProfileScreen({super.key, required this.userId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authRepositoryProvider);
    final feed = ref.watch(feedRepositoryProvider);
    final user = auth.currentUser; // In-memory: viewing self for MVP
    final posts = feed.postsForUser(userId);

    return Scaffold(
      appBar: AppBar(
        title: Text(user?.displayName ?? 'Profile'),
      ),
      body: ListView(
        children: [
          const SizedBox(height: 16),
          Center(
            child: CircleAvatar(
              radius: 36,
              child: Text(user?.displayName.substring(0, 1) ?? '?'),
            ),
          ),
          const SizedBox(height: 8),
          Center(
            child: Text(
              user?.displayName ?? 'Unknown',
              style: Theme.of(context).textTheme.titleLarge,
            ),
          ),
          const SizedBox(height: 16),
          const Divider(height: 1),
          ...posts.map((p) => PostCard(post: p)),
        ],
      ),
    );
  }
}
