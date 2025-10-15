import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../features/splash/splash_screen.dart';
import '../features/home/home_screen.dart';
import '../features/auth/sign_in_screen.dart';
import '../features/auth/sign_up_screen.dart';
import '../providers/auth_providers.dart';
import '../features/create_post/create_post_screen.dart';
import '../features/profile/profile_screen.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authRepositoryProvider);
  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: auth,
    redirect: (BuildContext context, GoRouterState state) {
      final bool loggedIn = auth.isAuthenticated;
      final bool isOnAuth = state.matchedLocation == '/sign-in' || state.matchedLocation == '/sign-up';

      if (!loggedIn) {
        if (isOnAuth) return null;
        // Skip redirect loop if already on splash
        if (state.matchedLocation == '/splash') return null;
        return '/sign-in';
      }

      if (loggedIn && isOnAuth) return '/';
      return null;
    },
    routes: [
      GoRoute(
        path: '/splash',
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: '/',
        builder: (context, state) => const HomeScreen(),
      ),
      GoRoute(
        path: '/create-post',
        builder: (context, state) => const CreatePostScreen(),
      ),
      GoRoute(
        path: '/profile/:userId',
        builder: (context, state) => ProfileScreen(
          userId: state.pathParameters['userId']!,
        ),
      ),
      GoRoute(
        path: '/sign-in',
        builder: (context, state) => const SignInScreen(),
      ),
      GoRoute(
        path: '/sign-up',
        builder: (context, state) => const SignUpScreen(),
      ),
    ],
  );
});
