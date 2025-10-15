class AppUser {
  final String id;
  final String displayName;
  final String? avatarUrl;

  const AppUser({
    required this.id,
    required this.displayName,
    this.avatarUrl,
  });
}
