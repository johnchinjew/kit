module Main exposing (main)

import Browser exposing (Document)
import Html exposing (Html)
import Html.Attributes as Attributes
import Html.Events as Events
import NoticeState exposing (Notice, NoticeState)
import Session exposing (Session)
import TaskCreation
import Task_ exposing (Task)
import User exposing (User)
import UserData exposing (UserData)


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
    , taskCreation : TaskCreation.State
    }


init : () -> ( Model, Cmd Msg )
init _ =
    ( { session = Session.init
      , noticeState = NoticeState.empty
      , taskCreation = TaskCreation.empty
      }
    , Cmd.none
    )



-- UPDATE


type Msg
    = SignInClicked
    | SignOutClicked
    | CreateTaskClicked
    | TaskTitleChanged String
    | TaskCreationMsg TaskCreation.Msg
    | SessionMsg Session.Msg
    | NoticeStateMsg NoticeState.Msg


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        SignInClicked ->
            Session.signIn model.session |> handleSessionOutcome model

        SignOutClicked ->
            Session.signOut model.session
                |> handleSessionOutcome { model | taskCreation = TaskCreation.reset model.taskCreation }

        CreateTaskClicked ->
            if not (Session.isSignedIn model.session) then
                ( model, Cmd.none )

            else
                TaskCreation.update TaskCreation.Submit model.taskCreation
                    |> handleTaskCreationOutcome model

        TaskTitleChanged title ->
            ( { model | taskCreation = TaskCreation.setTitle title model.taskCreation }, Cmd.none )

        TaskCreationMsg taskMsg ->
            TaskCreation.update taskMsg model.taskCreation
                |> handleTaskCreationOutcome model

        SessionMsg sessionMsg ->
            let
                modelForSessionMsg =
                    case sessionMsg of
                        Session.AuthChanged _ ->
                            { model | taskCreation = TaskCreation.reset model.taskCreation }

                        _ ->
                            model
            in
            Session.update sessionMsg model.session |> handleSessionOutcome modelForSessionMsg

        NoticeStateMsg noticeMsg ->
            NoticeState.update noticeMsg model.noticeState |> handleNoticeStateOutcome model


handleTaskCreationOutcome : Model -> ( TaskCreation.State, Maybe String, Cmd TaskCreation.Msg ) -> ( Model, Cmd Msg )
handleTaskCreationOutcome model ( taskCreation, maybeNotice, taskCreationCmd ) =
    let
        updatedModel =
            { model | taskCreation = taskCreation }

        cmdFromTaskCreation =
            Cmd.map TaskCreationMsg taskCreationCmd
    in
    case maybeNotice of
        Nothing ->
            ( updatedModel, cmdFromTaskCreation )

        Just notice ->
            let
                ( modelWithNotice, cmdFromNotice ) =
                    NoticeState.set notice model.noticeState
                        |> handleNoticeStateOutcome updatedModel
            in
            ( modelWithNotice, Cmd.batch [ cmdFromTaskCreation, cmdFromNotice ] )


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
    Sub.batch
        [ Sub.map SessionMsg Session.subscriptions
        , Sub.map TaskCreationMsg TaskCreation.subscriptions
        ]



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

        Session.SignedIn user userData ->
            [ viewSignOutButton model
            , viewProfilePhoto user
            , viewNewTaskForm model
            , viewTaskList userData
            ]
                ++ viewNotice model.noticeState.current

        Session.SigningOut user userData ->
            [ Html.text "Signing out"
            , viewProfilePhoto user
            , viewTaskList userData
            ]
                ++ viewNotice model.noticeState.current

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


viewNewTaskForm : Model -> Html Msg
viewNewTaskForm model =
    Html.div []
        [ Html.input
            [ Attributes.type_ "text"
            , Attributes.value (TaskCreation.title model.taskCreation)
            , Attributes.placeholder "Task title"
            , Events.onInput TaskTitleChanged
            ]
            []
        , Html.button
            [ Attributes.type_ "button"
            , Attributes.disabled
                (String.isEmpty (String.trim (TaskCreation.title model.taskCreation))
                    || TaskCreation.isPending model.taskCreation
                )
            , Events.onClick CreateTaskClicked
            ]
            [ Html.text "Add task" ]
        ]


viewTaskList : UserData -> Html msg
viewTaskList userData =
    Html.ul [] (List.map viewTask userData.tasks)


viewTask : Task -> Html msg
viewTask task =
    Html.li [] [ Html.text task.title ]


viewNotice : Maybe Notice -> List (Html msg)
viewNotice maybeNotice =
    case maybeNotice of
        Just notice ->
            [ Html.p [] [ Html.text notice.message ] ]

        Nothing ->
            []
