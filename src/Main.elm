module Main exposing (main)

import Browser exposing (Document)
import Html exposing (Html)
import Html.Attributes as Attributes
import Html.Events as Events
import NoticeState exposing (Notice, NoticeState)
import Session exposing (Session)
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
            NoticeState.update noticeMsg model.noticeState |> handleNoticeStateOutcome model


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
    { title = "Kit", body = viewBody model }


viewBody : Model -> List (Html Msg)
viewBody model =
    case model.session of
        Session.CheckingAuth ->
            Html.text "Loading" :: viewNotice model.noticeState.current

        Session.SigningIn ->
            Html.text "Signing in" :: viewNotice model.noticeState.current

        Session.SignedIn user ->
            [ viewSignOutButton model, viewProfilePhoto user ] ++ viewNotice model.noticeState.current

        Session.SigningOut user ->
            [ Html.text "Signing out", viewProfilePhoto user ] ++ viewNotice model.noticeState.current

        Session.SignedOut ->
            viewSignInButton model :: viewNotice model.noticeState.current


viewSignInButton : Model -> Html Msg
viewSignInButton model =
    Html.button
        [ Attributes.type_ "button"
        , Attributes.disabled (not (Session.isSignedOut model.session))
        , Events.onClick SignInClicked
        ]
        [ Html.text "Sign in with Google" ]


viewSignOutButton : Model -> Html Msg
viewSignOutButton model =
    Html.button
        [ Attributes.type_ "button"
        , Attributes.disabled (not (Session.isSignedIn model.session))
        , Events.onClick SignOutClicked
        ]
        [ Html.text "Sign out" ]


viewProfilePhoto : User -> Html msg
viewProfilePhoto user =
    Html.img
        [ Attributes.src (Maybe.withDefault "/assets/profile-placeholder.svg" user.photoUrl)
        , Attributes.alt "Profile photo"
        ]
        []


viewNotice : Maybe Notice -> List (Html msg)
viewNotice maybeNotice =
    case maybeNotice of
        Just notice ->
            [ Html.p [] [ Html.text notice.message ] ]

        Nothing ->
            []
