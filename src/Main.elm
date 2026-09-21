module Main exposing (main)

import Browser exposing (Document)
import Html
import Html.Attributes as Attributes
import Html.Events as Events
import NoticeState exposing (Notice, NoticeState)
import Ports
import User exposing (User)


main : Program () Model Msg
main =
    Browser.document
        { init = init
        , update = update
        , subscriptions = subscriptions
        , view = view
        }



-- MODEL


type alias Model =
    { session : Session
    , noticeState : NoticeState
    }


type Session
    = CheckingAuth
    | SigningIn
    | SignedIn User
    | SigningOut User
    | SignedOut


isSignedOut : Model -> Bool
isSignedOut model =
    model.session == SignedOut


isSignedIn : Model -> Bool
isSignedIn model =
    case model.session of
        SignedIn _ ->
            True

        _ ->
            False


init : () -> ( Model, Cmd Msg )
init _ =
    ( { session = CheckingAuth
      , noticeState = NoticeState.empty
      }
    , Cmd.none
    )



-- UPDATE


type Msg
    = SignInClicked
    | SignInFailed String
    | SignOutClicked
    | SignOutFailed String
    | AuthChanged (Maybe User)
    | NoticeStateMsg NoticeState.Msg


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        SignInClicked ->
            case model.session of
                SignedOut ->
                    ( { model | session = SigningIn }, Ports.signIn () )

                _ ->
                    ( model, Cmd.none )

        SignInFailed code ->
            case model.session of
                CheckingAuth ->
                    model |> showNotice (signInErrorMessage code)

                SigningIn ->
                    { model | session = SignedOut }
                        |> showNotice (signInErrorMessage code)

                _ ->
                    ( model, Cmd.none )

        SignOutClicked ->
            case model.session of
                SignedIn user ->
                    ( { model | session = SigningOut user }, Ports.signOut () )

                _ ->
                    ( model, Cmd.none )

        SignOutFailed code ->
            case model.session of
                SigningOut user ->
                    { model | session = SignedIn user }
                        |> showNotice (signOutErrorMessage code)

                _ ->
                    ( model, Cmd.none )

        AuthChanged user ->
            ( { model | session = sessionFromUser user }, Cmd.none )

        NoticeStateMsg noticeMsg ->
            NoticeState.update noticeMsg model.noticeState
                |> handleNoticeStateOutcome model


sessionFromUser : Maybe User -> Session
sessionFromUser maybeUser =
    case maybeUser of
        Just user ->
            SignedIn user

        Nothing ->
            SignedOut


signInErrorMessage : String -> String
signInErrorMessage code =
    case code of
        "auth/network-request-failed" ->
            "Could not sign in. Check your connection and try again later."

        "auth/user-disabled" ->
            "Account has been disabled."

        _ ->
            "Could not sign in. Please try again later."


signOutErrorMessage : String -> String
signOutErrorMessage code =
    case code of
        "auth/network-request-failed" ->
            "Could not sign out. Check your connection and try again."

        _ ->
            "Could not sign out. Please try again."


showNotice : String -> Model -> ( Model, Cmd Msg )
showNotice message model =
    NoticeState.set message model.noticeState
        |> handleNoticeStateOutcome model


handleNoticeStateOutcome : Model -> ( NoticeState, Cmd NoticeState.Msg ) -> ( Model, Cmd Msg )
handleNoticeStateOutcome model ( noticeState, noticeCmd ) =
    ( { model | noticeState = noticeState }
    , Cmd.map NoticeStateMsg noticeCmd
    )



-- SUBSCRIPTIONS


subscriptions : Model -> Sub Msg
subscriptions _ =
    Sub.batch
        [ Ports.authChanged AuthChanged
        , Ports.signInFailed SignInFailed
        , Ports.signOutFailed SignOutFailed
        ]



-- VIEW


view : Model -> Document Msg
view model =
    { title = "Kit"
    , body =
        [ sessionSummary model.session
        , signInButton model
        , signOutButton model
        ]
            ++ profilePhoto model.session
            ++ notice model.noticeState.current
    }


sessionSummary : Session -> Html.Html Msg
sessionSummary session =
    case session of
        CheckingAuth ->
            Html.h1 [] [ Html.text "CheckingAuth" ]

        SigningIn ->
            Html.h1 [] [ Html.text "SigningIn" ]

        SignedIn _ ->
            Html.h1 [] [ Html.text "SignedIn" ]

        SigningOut _ ->
            Html.h1 [] [ Html.text "SigningOut" ]

        SignedOut ->
            Html.h1 [] [ Html.text "SignedOut" ]


signInButton : Model -> Html.Html Msg
signInButton model =
    Html.button
        [ Attributes.type_ "button"
        , Attributes.disabled (not (isSignedOut model))
        , Events.onClick SignInClicked
        ]
        [ Html.text "Sign in with Google" ]


signOutButton : Model -> Html.Html Msg
signOutButton model =
    Html.button
        [ Attributes.type_ "button"
        , Attributes.disabled (not (isSignedIn model))
        , Events.onClick SignOutClicked
        ]
        [ Html.text "Sign out" ]


profilePhoto : Session -> List (Html.Html msg)
profilePhoto session =
    case session of
        SignedIn user ->
            profilePhotoImg user.photoUrl

        SigningOut user ->
            profilePhotoImg user.photoUrl

        _ ->
            []


profilePhotoImg : Maybe String -> List (Html.Html msg)
profilePhotoImg maybePhotoUrl =
    [ Html.img
        [ Attributes.src (Maybe.withDefault "/assets/profile-placeholder.svg" maybePhotoUrl)
        , Attributes.alt "Profile photo"
        ]
        []
    ]


notice : Maybe Notice -> List (Html.Html msg)
notice maybeNotice =
    case maybeNotice of
        Just currentNotice ->
            [ Html.p [] [ Html.text currentNotice.message ] ]

        Nothing ->
            []
