module Session exposing
    ( Msg(..)
    , Notice
    , Session(..)
    , init
    , isSignedIn
    , isSignedOut
    , signIn
    , signOut
    , subscriptions
    , update
    )

import Ports
import User exposing (User)


type Session
    = CheckingAuth
    | SigningIn
    | SignedIn User
    | SigningOut User
    | SignedOut


type alias Notice =
    { message : String }


type Msg
    = SignInFailed String
    | SignOutFailed String
    | AuthChanged (Maybe User)


init : Session
init =
    CheckingAuth


isSignedIn : Session -> Bool
isSignedIn session =
    case session of
        SignedIn _ ->
            True

        _ ->
            False


isSignedOut : Session -> Bool
isSignedOut session =
    session == SignedOut


signIn : Session -> ( Session, Maybe Notice, Cmd Msg )
signIn session =
    case session of
        SignedOut ->
            ( SigningIn, Nothing, Ports.signIn () )

        _ ->
            ( session, Nothing, Cmd.none )


signOut : Session -> ( Session, Maybe Notice, Cmd Msg )
signOut session =
    case session of
        SignedIn user ->
            ( SigningOut user, Nothing, Ports.signOut () )

        _ ->
            ( session, Nothing, Cmd.none )


update : Msg -> Session -> ( Session, Maybe Notice, Cmd Msg )
update msg session =
    case msg of
        SignInFailed code ->
            let
                notice =
                    Just (signInNotice code)
            in
            case session of
                CheckingAuth ->
                    ( CheckingAuth, notice, Cmd.none )

                SigningIn ->
                    ( SignedOut, notice, Cmd.none )

                _ ->
                    ( session, Nothing, Cmd.none )

        SignOutFailed code ->
            case session of
                SigningOut user ->
                    ( SignedIn user, Just (signOutNotice code), Cmd.none )

                _ ->
                    ( session, Nothing, Cmd.none )

        AuthChanged maybeUser ->
            ( fromUser maybeUser, Nothing, Cmd.none )


fromUser : Maybe User -> Session
fromUser maybeUser =
    case maybeUser of
        Just user ->
            SignedIn user

        Nothing ->
            SignedOut


signInNotice : String -> Notice
signInNotice code =
    case code of
        "auth/network-request-failed" ->
            { message = "Could not sign in. Check your connection and try again later." }

        "auth/user-disabled" ->
            { message = "Account has been disabled." }

        _ ->
            { message = "Could not sign in. Please try again later." }


signOutNotice : String -> Notice
signOutNotice code =
    case code of
        "auth/network-request-failed" ->
            { message = "Could not sign out. Check your connection and try again." }

        _ ->
            { message = "Could not sign out. Please try again." }


subscriptions : Sub Msg
subscriptions =
    Sub.batch
        [ Ports.authChanged AuthChanged
        , Ports.signInFailed SignInFailed
        , Ports.signOutFailed SignOutFailed
        ]
