module NoticeState exposing
    ( Msg(..)
    , Notice
    , NoticeState
    , empty
    , set
    , update
    )

import Process
import Task


type alias NoticeState =
    { current : Maybe Notice
    , nextId : Int
    }


type alias Notice =
    { id : Int
    , message : String
    }


type Msg
    = Expired Int


empty : NoticeState
empty =
    { current = Nothing, nextId = 0 }


set : String -> NoticeState -> ( NoticeState, Cmd Msg )
set message state =
    let
        notice =
            { id = state.nextId
            , message = message
            }
    in
    ( { state | current = Just notice, nextId = state.nextId + 1 }
    , Task.perform (\_ -> Expired notice.id) (Process.sleep (toFloat 6000))
    )


update : Msg -> NoticeState -> ( NoticeState, Cmd Msg )
update msg state =
    case msg of
        Expired noticeId ->
            ( expire noticeId state, Cmd.none )


expire : Int -> NoticeState -> NoticeState
expire noticeId state =
    case state.current of
        Just notice ->
            if notice.id == noticeId then
                { state | current = Nothing }

            else
                state

        Nothing ->
            state
