module NoticeTest exposing (tests)

import Expect
import NoticeState exposing (NoticeState)
import Test exposing (Test)


tests : Test
tests =
    Test.describe "NoticeState"
        [ Test.test "starts empty" <|
            \_ ->
                Expect.equal
                    { current = Nothing
                    , nextId = 0
                    }
                    NoticeState.empty
        , Test.test "sets the current notice and increments its ID" <|
            \_ ->
                let
                    ( firstState, _ ) =
                        NoticeState.set "First" NoticeState.empty

                    ( secondState, _ ) =
                        NoticeState.set "Second" firstState
                in
                Expect.equal
                    { current =
                        Just
                            { id = 1
                            , message = "Second"
                            }
                    , nextId = 2
                    }
                    secondState
        , Test.test "expires the current notice and preserves the next ID" <|
            \_ ->
                let
                    ( state, _ ) =
                        NoticeState.set "First" NoticeState.empty

                    ( expiredState, _ ) =
                        NoticeState.update (NoticeState.Expired 0) state
                in
                Expect.equal
                    { current = Nothing
                    , nextId = 1
                    }
                    expiredState
        , Test.test "ignores expiration for a replaced notice" <|
            \_ ->
                let
                    ( firstState, _ ) =
                        NoticeState.set "First" NoticeState.empty

                    ( secondState, _ ) =
                        NoticeState.set "Second" firstState

                    ( afterOldExpiration, _ ) =
                        NoticeState.update (NoticeState.Expired 0) secondState
                in
                Expect.equal secondState afterOldExpiration
        ]
