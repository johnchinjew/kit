port module Main exposing (main)

import Browser exposing (Document)
import Html
import Html.Attributes as Attributes
import Html.Events as Events
import NoticeState exposing (Notice, NoticeState)


port signIn : () -> Cmd msg


port signInFailed : (String -> msg) -> Sub msg


port signOut : () -> Cmd msg


port signOutFailed : (String -> msg) -> Sub msg


port authChanged : (Maybe User -> msg) -> Sub msg


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


type alias User =
    { photoUrl : Maybe String }


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
    | NoticeExpired Int


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        SignInClicked ->
            case model.session of
                SignedOut ->
                    ( { model | session = SigningIn }, signIn () )

                _ ->
                    ( model, Cmd.none )

        SignInFailed code ->
            case model.session of
                CheckingAuth ->
                    ( model, Cmd.none )
                        |> showNotice (signInErrorMessage code)

                SigningIn ->
                    ( { model | session = SignedOut }, Cmd.none )
                        |> showNotice (signInErrorMessage code)

                _ ->
                    ( model, Cmd.none )

        SignOutClicked ->
            case model.session of
                SignedIn user ->
                    ( { model | session = SigningOut user }, signOut () )

                _ ->
                    ( model, Cmd.none )

        SignOutFailed code ->
            case model.session of
                SigningOut user ->
                    ( { model | session = SignedIn user }, Cmd.none )
                        |> showNotice (signOutErrorMessage code)

                _ ->
                    ( model, Cmd.none )

        AuthChanged user ->
            ( { model | session = sessionFromUser user }, Cmd.none )

        NoticeExpired noticeId ->
            ( { model | noticeState = NoticeState.expire noticeId model.noticeState }, Cmd.none )


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


showNotice : String -> ( Model, Cmd Msg ) -> ( Model, Cmd Msg )
showNotice message ( model, cmd ) =
    let
        ( noticeState, noticeCmd ) =
            NoticeState.set NoticeExpired message model.noticeState
    in
    ( { model | noticeState = noticeState }
    , Cmd.batch [ cmd, noticeCmd ]
    )



-- SUBSCRIPTIONS


subscriptions : Model -> Sub Msg
subscriptions _ =
    Sub.batch
        [ authChanged AuthChanged
        , signInFailed SignInFailed
        , signOutFailed SignOutFailed
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
