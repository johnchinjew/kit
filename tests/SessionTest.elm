module SessionTest exposing (tests)

import Expect
import Session exposing (Msg(..), Session(..))
import Test exposing (Test)


tests : Test
tests =
    Test.describe "Session"
        [ Test.test "sign-in failure returns to signed out with a user-facing notice" <|
            \_ ->
                let
                    ( session, authFailure, _ ) =
                        Session.update (SignInFailed "auth/network-request-failed") SigningIn
                in
                Expect.equal
                    ( SignedOut
                    , Just { message = "Could not sign in. Check your connection and try again later." }
                    )
                    ( session, authFailure )
        , Test.test "reports a sign-in failure while authentication is still checking" <|
            \_ ->
                let
                    ( session, maybeNotice, _ ) =
                        Session.update (SignInFailed "auth/network-request-failed") CheckingAuth
                in
                Expect.equal
                    ( CheckingAuth
                    , Just { message = "Could not sign in. Check your connection and try again later." }
                    )
                    ( session, maybeNotice )
        , Test.test "translates disabled-account sign-in failure" <|
            \_ ->
                let
                    ( session, maybeNotice, _ ) =
                        Session.update (SignInFailed "auth/user-disabled") SigningIn
                in
                Expect.equal
                    ( SignedOut, Just { message = "Account has been disabled." } )
                    ( session, maybeNotice )
        , Test.test "uses a generic notice for an unknown sign-in failure" <|
            \_ ->
                let
                    ( session, maybeNotice, _ ) =
                        Session.update (SignInFailed "auth/unknown") SigningIn
                in
                Expect.equal
                    ( SignedOut, Just { message = "Could not sign in. Please try again later." } )
                    ( session, maybeNotice )
        , Test.test "ignores sign-in failure after authentication changed" <|
            \_ ->
                let
                    signedIn =
                        SignedIn { photoUrl = Nothing }

                    ( session, authFailure, _ ) =
                        Session.update (SignInFailed "auth/network-request-failed") signedIn
                in
                Expect.equal ( signedIn, Nothing ) ( session, authFailure )
        , Test.test "sign-out failure restores the signed-in user and reports the failure" <|
            \_ ->
                let
                    user =
                        { photoUrl = Just "photo.png" }

                    ( session, authFailure, _ ) =
                        Session.update (SignOutFailed "auth/network-request-failed") (SigningOut user)
                in
                Expect.equal
                    ( SignedIn user
                    , Just { message = "Could not sign out. Check your connection and try again." }
                    )
                    ( session, authFailure )
        , Test.test "ignores a stale sign-out failure after authentication changed" <|
            \_ ->
                let
                    signedIn =
                        SignedIn { photoUrl = Just "photo.png" }

                    ( session, maybeNotice, _ ) =
                        Session.update (SignOutFailed "auth/network-request-failed") signedIn
                in
                Expect.equal ( signedIn, Nothing ) ( session, maybeNotice )
        , Test.test "uses a generic notice for an unknown sign-out failure" <|
            \_ ->
                let
                    user =
                        { photoUrl = Nothing }

                    ( session, maybeNotice, _ ) =
                        Session.update (SignOutFailed "auth/unknown") (SigningOut user)
                in
                Expect.equal
                    ( SignedIn user, Just { message = "Could not sign out. Please try again." } )
                    ( session, maybeNotice )
        , Test.test "authentication changes replace the session state" <|
            \_ ->
                let
                    user =
                        { photoUrl = Just "photo.png" }

                    ( signedIn, signInNotice, _ ) =
                        Session.update (AuthChanged (Just user)) SignedOut

                    ( signedOut, signOutNotice, _ ) =
                        Session.update (AuthChanged Nothing) (SigningOut user)
                in
                Expect.equal
                    ( ( SignedIn user, Nothing ), ( SignedOut, Nothing ) )
                    ( ( signedIn, signInNotice ), ( signedOut, signOutNotice ) )
        , Test.test "sign-in and sign-out start from their allowed states" <|
            \_ ->
                let
                    user =
                        { photoUrl = Just "photo.png" }

                    ( signInState, signInNotice, _ ) =
                        Session.signIn SignedOut

                    ( signOutState, signOutNotice, _ ) =
                        Session.signOut (SignedIn user)
                in
                Expect.equal
                    ( ( SigningIn, Nothing ), ( SigningOut user, Nothing ) )
                    ( ( signInState, signInNotice ), ( signOutState, signOutNotice ) )
        , Test.test "sign-in and sign-out are ignored in disallowed states" <|
            \_ ->
                let
                    user =
                        { photoUrl = Just "photo.png" }

                    ( signInState, signInNotice, _ ) =
                        Session.signIn CheckingAuth

                    ( signOutState, signOutNotice, _ ) =
                        Session.signOut (SigningOut user)
                in
                Expect.equal
                    ( ( CheckingAuth, Nothing ), ( SigningOut user, Nothing ) )
                    ( ( signInState, signInNotice ), ( signOutState, signOutNotice ) )
        ]
