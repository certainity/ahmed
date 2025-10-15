import 'package:flutter/foundation.dart';
import '../models/user.dart';

class AuthRepository extends ChangeNotifier {
  AppUser? _currentUser;

  AppUser? get currentUser => _currentUser;
  bool get isAuthenticated => _currentUser != null;

  Future<AppUser> signIn({required String displayName}) async {
    // In-memory sign-in; assume user exists or create ephemeral session
    _currentUser = AppUser(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      displayName: displayName.trim(),
    );
    notifyListeners();
    return _currentUser!;
  }

  Future<AppUser> signUp({required String displayName}) async {
    // In-memory sign-up; same as sign-in for this MVP
    return signIn(displayName: displayName);
  }

  Future<void> signOut() async {
    _currentUser = null;
    notifyListeners();
  }
}
