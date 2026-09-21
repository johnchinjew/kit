module Main exposing (main)

import Browser exposing (Document)
import Html
import Html.Attributes as Attributes
import Html.Events as Events
import NoticeState exposing (Notice, NoticeState)
import Session exposing (Session)


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


init : () -> ( Model, Cmd Msg )
init _ =
    ( { session = Session.init
      , noticeState = NoticeState.empty
      }
    , Cmd.none
    )



-- UPDATE


type Msg
    = SignInClicked
    | SignOutClicked
    | SessionMsg Session.Msg
    | NoticeStateMsg NoticeState.Msg


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        SignInClicked ->
            Session.signIn model.session |> handleSessionOutcome model

        SignOutClicked ->
            Session.signOut model.session |> handleSessionOutcome model

        SessionMsg sessionMsg ->
            Session.update sessionMsg model.session |> handleSessionOutcome model

        NoticeStateMsg noticeMsg ->
            NoticeState.update noticeMsg model.noticeState
                |> handleNoticeStateOutcome model


handleSessionOutcome : Model -> ( Session, Maybe Session.Notice, Cmd Session.Msg ) -> ( Model, Cmd Msg )
handleSessionOutcome model ( session, maybeNotice, sessionCmd ) =
    let
        modelWithSession =
            { model | session = session }

        cmdFromSession =
            Cmd.map SessionMsg sessionCmd
    in
    case maybeNotice of
        Nothing ->
            ( modelWithSession, cmdFromSession )

        Just sessionNotice ->
            let
                ( modelWithNotice, cmdFromNotice ) =
                    NoticeState.set sessionNotice.message modelWithSession.noticeState
                        |> handleNoticeStateOutcome modelWithSession
            in
            ( modelWithNotice, Cmd.batch [ cmdFromSession, cmdFromNotice ] )


handleNoticeStateOutcome : Model -> ( NoticeState, Cmd NoticeState.Msg ) -> ( Model, Cmd Msg )
handleNoticeStateOutcome model ( noticeState, noticeCmd ) =
    ( { model | noticeState = noticeState }
    , Cmd.map NoticeStateMsg noticeCmd
    )



-- SUBSCRIPTIONS


subscriptions : Model -> Sub Msg
subscriptions _ =
    Sub.map SessionMsg Session.subscriptions



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
        Session.CheckingAuth ->
            Html.h1 [] [ Html.text "CheckingAuth" ]

        Session.SigningIn ->
            Html.h1 [] [ Html.text "SigningIn" ]

        Session.SignedIn _ ->
            Html.h1 [] [ Html.text "SignedIn" ]

        Session.SigningOut _ ->
            Html.h1 [] [ Html.text "SigningOut" ]

        Session.SignedOut ->
            Html.h1 [] [ Html.text "SignedOut" ]


signInButton : Model -> Html.Html Msg
signInButton model =
    Html.button
        [ Attributes.type_ "button"
        , Attributes.disabled (not (Session.isSignedOut model.session))
        , Events.onClick SignInClicked
        ]
        [ Html.text "Sign in with Google" ]


signOutButton : Model -> Html.Html Msg
signOutButton model =
    Html.button
        [ Attributes.type_ "button"
        , Attributes.disabled (not (Session.isSignedIn model.session))
        , Events.onClick SignOutClicked
        ]
        [ Html.text "Sign out" ]


profilePhoto : Session -> List (Html.Html msg)
profilePhoto session =
    case session of
        Session.SignedIn user ->
            profilePhotoImg user.photoUrl

        Session.SigningOut user ->
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
