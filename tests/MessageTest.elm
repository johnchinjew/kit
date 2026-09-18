module MessageTest exposing (tests)

import Expect
import Message
import Test exposing (Test)


tests : Test
tests =
    Test.describe "Message"
        [ Test.test "provides the expected message" <|
            \_ ->
                Expect.equal "Kit is under construction" Message.message
        ]
