module TaskCreation exposing (Msg(..), State, empty, isPending, reset, setTitle, subscriptions, title, update)

import Ports
import UserData


type State
    = State { title : String, pending : Pending }


type Pending
    = Idle
    | AwaitingUuid String


type Msg
    = Submit
    | UuidGenerated String
    | UuidFailed String
    | WriteFailed String


empty : State
empty =
    State { title = "", pending = Idle }


title : State -> String
title (State state) =
    state.title


isPending : State -> Bool
isPending (State state) =
    state.pending /= Idle


setTitle : String -> State -> State
setTitle newTitle (State state) =
    State { state | title = newTitle }


reset : State -> State
reset _ =
    empty


update : Msg -> State -> ( State, Maybe String, Cmd Msg )
update msg (State state) =
    case ( msg, state.pending ) of
        ( Submit, Idle ) ->
            let
                trimmedTitle =
                    String.trim state.title
            in
            if String.isEmpty trimmedTitle then
                ( State state, Nothing, Cmd.none )

            else
                ( State { state | title = "", pending = AwaitingUuid trimmedTitle }, Nothing, Ports.generateUuid () )

        ( UuidGenerated id, AwaitingUuid taskTitle ) ->
            ( State { state | pending = Idle }
            , Nothing
            , Ports.setDoc (UserData.createTask { id = id, title = taskTitle })
            )

        ( UuidFailed _, AwaitingUuid _ ) ->
            ( State { state | pending = Idle }, Just failureNotice, Cmd.none )

        ( WriteFailed _, _ ) ->
            ( State state, Just failureNotice, Cmd.none )

        _ ->
            ( State state, Nothing, Cmd.none )


failureNotice : String
failureNotice =
    "Could not add task. Please try again."


subscriptions : Sub Msg
subscriptions =
    Sub.batch
        [ Ports.uuidGenerated UuidGenerated
        , Ports.uuidFailed UuidFailed
        , Ports.setDocFailed WriteFailed
        ]
