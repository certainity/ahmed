import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../repositories/feed_repository.dart';

final feedRepositoryProvider = ChangeNotifierProvider<FeedRepository>((ref) {
  return FeedRepository();
});
