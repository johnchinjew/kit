port module Main exposing (main)

import Browser exposing (Document)
import Html
import Html.Attributes as Attributes
import Html.Events as Events
import Message


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
    { authStatus : AuthStatus
    , errorMessage : Maybe String
    }


type AuthStatus
    = CheckingAuth
    | SigningIn
    | SignedIn User
    | SigningOut User
    | SignedOut


isSignedOut : Model -> Bool
isSignedOut model =
    model.authStatus == SignedOut


isSignedIn : Model -> Bool
isSignedIn model =
    case model.authStatus of
        SignedIn _ ->
            True

        _ ->
            False


type alias User =
    { photoUrl : Maybe String }


init : () -> ( Model, Cmd Msg )
init _ =
    ( { authStatus = CheckingAuth
      , errorMessage = Nothing
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


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        SignInClicked ->
            case model.authStatus of
                SignedOut ->
                    ( { model | authStatus = SigningIn, errorMessage = Nothing }, signIn () )

                _ ->
                    ( model, Cmd.none )

        SignInFailed code ->
            case model.authStatus of
                CheckingAuth ->
                    ( { model | errorMessage = Just (signInErrorMessage code) }, Cmd.none )

                SigningIn ->
                    ( { model | authStatus = SignedOut, errorMessage = Just (signInErrorMessage code) }, Cmd.none )

                _ ->
                    ( model, Cmd.none )

        SignOutClicked ->
            case model.authStatus of
                SignedIn user ->
                    ( { model | authStatus = SigningOut user, errorMessage = Nothing }, signOut () )

                _ ->
                    ( model, Cmd.none )

        SignOutFailed code ->
            case model.authStatus of
                SigningOut user ->
                    ( { model | authStatus = SignedIn user, errorMessage = Just (signOutErrorMessage code) }, Cmd.none )

                _ ->
                    ( model, Cmd.none )

        AuthChanged user ->
            ( { model | authStatus = authStatusFromUser user }, Cmd.none )


authStatusFromUser : Maybe User -> AuthStatus
authStatusFromUser maybeUser =
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
        [ Html.h1 [] [ Html.text Message.message ]
        , authStatusSummary model.authStatus
        , signInButton model
        , signOutButton model
        ]
            ++ profilePhoto model.authStatus
            ++ errorMessage model.errorMessage
    }


authStatusSummary : AuthStatus -> Html.Html Msg
authStatusSummary authStatus =
    case authStatus of
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


profilePhoto : AuthStatus -> List (Html.Html msg)
profilePhoto authStatus =
    case authStatus of
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


errorMessage : Maybe String -> List (Html.Html msg)
errorMessage maybeMessage =
    case maybeMessage of
        Just message ->
            [ Html.p [] [ Html.text message ] ]

        Nothing ->
            []
