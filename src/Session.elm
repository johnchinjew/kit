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

import Json.Decode as Decode
import Ports
import User exposing (User)
import UserData exposing (UserData)


type Session
    = CheckingAuth
    | SigningIn
    | SignedIn User UserData
    | SigningOut User UserData
    | SignedOut


type alias Notice =
    { message : String }


type Msg
    = SignInFailed String
    | SignOutFailed String
    | AuthChanged (Maybe User)
    | UserDataChanged (Maybe Decode.Value)
    | UserDataFailed String


init : Session
init =
    CheckingAuth


isSignedIn : Session -> Bool
isSignedIn session =
    case session of
        SignedIn _ _ ->
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
        SignedIn user userData ->
            ( SigningOut user userData, Nothing, Ports.signOut () )

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
                SigningOut user userData ->
                    ( SignedIn user userData, Just (signOutNotice code), Cmd.none )

                _ ->
                    ( session, Nothing, Cmd.none )

        UserDataChanged maybeDocument ->
            case maybeDocument of
                Nothing ->
                    ( updateUserData UserData.empty session, Nothing, Cmd.none )

                Just document ->
                    case Decode.decodeValue UserData.decoder document of
                        Ok userData ->
                            ( updateUserData userData session, Nothing, Cmd.none )

                        Err _ ->
                            update (UserDataFailed "decode-failed") session

        UserDataFailed _ ->
            case session of
                SignedIn _ _ ->
                    ( session, Just { message = "Could not load your tasks. Please try again." }, Cmd.none )

                SigningOut _ _ ->
                    ( session, Just { message = "Could not load your tasks. Please try again." }, Cmd.none )

                _ ->
                    ( session, Nothing, Cmd.none )

        AuthChanged maybeUser ->
            ( fromUser maybeUser, Nothing, Cmd.none )


updateUserData : UserData -> Session -> Session
updateUserData userData session =
    case session of
        SignedIn user _ ->
            SignedIn user userData

        SigningOut user _ ->
            SigningOut user userData

        _ ->
            session


fromUser : Maybe User -> Session
fromUser maybeUser =
    case maybeUser of
        Just user ->
            SignedIn user UserData.empty

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
        , Ports.userDataChanged UserDataChanged
        , Ports.userDataFailed UserDataFailed
        ]
